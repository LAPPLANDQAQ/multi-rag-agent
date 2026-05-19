---
name: database_connection_diagnosis
display_name: Database Connection Diagnosis
description: Diagnose database dependency connection failures such as MySQL, PostgreSQL, or Redis timeout, connection refused, DNS failure, port unreachable, and application API timeout symptoms without using credentials or write operations.
triggers:
  - database timeout
  - database connection refused
  - database connection pool
  - connection pool exhausted
  - MySQL timeout
  - MySQL connection refused
  - PostgreSQL timeout
  - Postgres connection refused
  - Redis timeout
  - Redis connection refused
  - upstream database dependency
  - DB connection
  - db timeout
  - SQL connection
allowed_tools:
  - search_knowledge_base
  - get_current_time
  - dns_lookup
  - ping_host
  - check_port
  - http_check
risk_level: low
---

# Database Connection Diagnosis Playbook

## Scope
- Application logs show database connection timeout, connection refused, pool exhaustion, or dependency timeout.
- MySQL, PostgreSQL, Redis, or another database-like dependency is unreachable from the application path.
- An upstream HTTP API is slow or failing because it depends on a database service.
- The user provides a public hostname, service endpoint, or application URL that can be checked safely.

## Out Of Scope And Safety Rules
- Do not request, store, or use database usernames, passwords, DSNs, private keys, or tokens.
- Do not run SQL, mutate data, restart services, flush cache, change pool settings, or perform any write operation.
- Do not invent database metrics. If no database metrics or logs are available, state that evidence is missing.
- Do not bypass network tool safeguards for private ranges, localhost, or internal scanning.
- Use public/demo targets only unless the operator explicitly confirms the target is safe to check.

## Phase 1: Clarify The Connection Chain
1. Extract the database type if present: MySQL, PostgreSQL, Redis, MongoDB, or unknown.
2. Extract the target hostname, port, and application URL if present.
3. If the input only says "database is down" without a host, port, or app URL, ask for the missing target instead of guessing.
4. Call `get_current_time` so the report has a real observation timestamp.
5. Call `search_knowledge_base` with the database type and symptom, for example `mysql connection refused`, `redis timeout`, or `connection pool exhausted`.

## Phase 2: DNS Layer
1. If a hostname is provided, call `dns_lookup(hostname)`.
2. If DNS fails, the likely direction is name resolution, DNS configuration, wrong service name, or stale environment configuration.
3. If DNS resolves, keep the resolved address as evidence and continue to connectivity.

## Phase 3: Network Reachability
1. Call `ping_host(host)` when the target is allowed by the tool.
2. Treat failed ping carefully: ICMP may be blocked even when TCP works.
3. Use the ping result only as supporting evidence, not as the sole root cause.

## Phase 4: TCP Port Layer
1. Call `check_port(host, port)` with the database port:
   - MySQL usually uses 3306.
   - PostgreSQL usually uses 5432.
   - Redis usually uses 6379.
   - Use the user-provided port when present.
2. Interpret results:
   - Refused means the host is reachable but no service is accepting that port, or a local firewall rejected it.
   - Timeout means a firewall, security group, route, or remote overload may be blocking the connection.
   - Connected means the network path is open; continue to application-level evidence.

## Phase 5: Application HTTP Evidence
1. If the user provides an application health URL or failing API URL, call `http_check(url)`.
2. Use HTTP status, response latency, and error text to distinguish:
   - 5xx with database errors: likely backend dependency failure.
   - 2xx but slow: possible pool saturation, slow query, or downstream pressure.
   - 4xx: likely request/auth issue, not database connectivity.
3. Do not claim the database itself is healthy only because the HTTP layer succeeds.

## Phase 6: Pool Exhaustion Reasoning
Use the available evidence to classify pool exhaustion separately from network failure:
- DNS and TCP OK, HTTP slow or 5xx, and logs mention pool wait/timeout: likely pool exhaustion or slow queries.
- DNS OK but TCP refused: service not listening, wrong host/port, container down, or bind-address mismatch.
- DNS OK but TCP timeout: firewall, route, security group, or overloaded target.
- DNS failed: service discovery or configuration issue.

## Report Format
Return a Markdown report with:
1. Observation timestamp.
2. Target summary: database type, host, port, and application URL if available.
3. Evidence table by layer: DNS, reachability, TCP port, HTTP, KB/SOP.
4. Most likely direction, explicitly marked as preliminary when evidence is partial.
5. Immediate safe checks for a human operator, such as verifying service status, security group, listener port, pool metrics, and recent deploy/config changes.
6. What data is still missing, such as application logs, database server logs, pool metrics, and real connection string host/port without secrets.

## Evidence Discipline
- Report only what tools returned or what the user supplied.
- If a tool is unavailable, say which layer could not be checked.
- Prefer "likely direction" over "root cause" unless multiple evidence layers agree.
- Never include credentials, internal secrets, or destructive remediation commands.
