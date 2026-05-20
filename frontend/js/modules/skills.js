// Skill 库 — 从原 app.js:58-120 搬迁,接口扩展为 init/highlight/clear
import { API } from "../core/api.js";
import { escapeHtml } from "../core/markdown.js";

const RISK_BADGE = {
    low:    { cls: "skill-risk-low",    label: "低风险" },
    medium: { cls: "skill-risk-medium", label: "中风险" },
    high:   { cls: "skill-risk-high",   label: "高风险" },
};

let skillsLoaded = false;

export async function loadSkills() {
    const listEl = document.getElementById("skill-list");
    const countEl = document.getElementById("skill-count");
    if (!listEl) return;
    try {
        const r = await fetch(`${API}/skills`);
        const data = await r.json();
        if (data?.code !== "SUCCESS") throw new Error(data?.message || "加载 Skill 失败");
        const skills = data?.data?.skills || [];
        if (countEl) countEl.textContent = `· ${skills.length} 个`;

        if (skills.length === 0) {
            listEl.innerHTML = '<span class="ink-empty" style="grid-column: 1/-1">暂无 Skill 注册</span>';
            return;
        }

        listEl.innerHTML = "";
        skills.forEach((s) => {
            const badge = RISK_BADGE[s.risk_level] || RISK_BADGE.low;
            const card = document.createElement("div");
            card.className = `skill-card ${badge.cls}`;
            card.dataset.skillName = s.name;
            card.title = `${s.display_name || s.name} (${badge.label})`;
            card.innerHTML = `
                <div style="font-weight:600;font-size:12.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(s.display_name || s.name)}</div>
                <div style="font-family:var(--font-mono);font-size:10.5px;color:var(--ink-muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(s.name)}</div>
            `;
            listEl.appendChild(card);
        });
    } catch (e) {
        listEl.innerHTML = `<span class="ink-warning" style="grid-column: 1/-1">加载失败: ${escapeHtml(e.message)}</span>`;
    }
}

export function highlightSkill(skillName, reason) {
    document.querySelectorAll(".skill-card.skill-active").forEach((el) => el.classList.remove("skill-active"));

    const card = document.querySelector(`.skill-card[data-skill-name="${CSS.escape(skillName || "")}"]`);
    const banner = document.getElementById("skill-selected-banner");
    const nameEl = document.getElementById("skill-selected-name");
    const reasonEl = document.getElementById("skill-reason");

    // 自动展开 Skill 折叠区,确保高亮可见
    const collapse = document.getElementById("skill-collapse");
    if (collapse && !collapse.classList.contains("is-open")) {
        collapse.classList.add("is-open");
    }

    if (card) {
        card.classList.add("skill-active");
        card.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "nearest" });
        if (nameEl) nameEl.textContent = card.querySelector("div")?.textContent || skillName;
    } else if (nameEl) {
        nameEl.textContent = skillName || "(未知)";
    }
    if (banner) banner.classList.remove("hidden");
    if (reasonEl) {
        if (reason) {
            reasonEl.textContent = `理由:${reason}`;
            reasonEl.classList.remove("hidden");
        } else {
            reasonEl.textContent = "";
            reasonEl.classList.add("hidden");
        }
    }
}

export function clearSkillHighlight() {
    document.querySelectorAll(".skill-card.skill-active").forEach((el) => el.classList.remove("skill-active"));
    document.getElementById("skill-selected-banner")?.classList.add("hidden");
    document.getElementById("skill-reason")?.classList.add("hidden");
}

export function initSkills() {
    if (skillsLoaded) return;
    skillsLoaded = true;
    loadSkills();

    // Skill 折叠区
    const collapse = document.getElementById("skill-collapse");
    const head = collapse?.querySelector(".ink-collapse-head");
    if (head && collapse) {
        head.addEventListener("click", () => collapse.classList.toggle("is-open"));
    }
}
