import assert from 'node:assert/strict';
import test from 'node:test';
import axios, { type InternalAxiosRequestConfig } from 'axios';
import { searchBaidu } from '../engines/baidu/baidu.js';

async function withResponse<T>(html: string, finalUrl: string, run: () => Promise<T>): Promise<T> {
    const originalAdapter = axios.defaults.adapter;
    let requests = 0;
    axios.defaults.adapter = async (config: InternalAxiosRequestConfig) => {
        requests += 1;
        return {
            data: html,
            status: 200,
            statusText: 'OK',
            headers: {},
            config,
            request: { res: { responseUrl: finalUrl } }
        };
    };
    try {
        const result = await run();
        assert.equal(requests, 1, 'Each response should be handled without retrying a verification page');
        return result;
    } finally {
        axios.defaults.adapter = originalAdapter;
    }
}

test('Baidu safety verification title is an explicit failure, not zero matches', async () => {
    await withResponse(
        '<html><title>百度安全验证</title><body>网络不给力，请稍后重试</body></html>',
        'https://www.baidu.com/s?wd=nginx',
        async () => {
            await assert.rejects(searchBaidu('Nginx 官方文档', 3), /Baidu.*verification.*captcha/i);
        }
    );
});

test('Baidu captcha redirect is detected even without the standard title', async () => {
    await withResponse(
        '<html><title>Continue</title><body>Please continue</body></html>',
        'https://wappass.baidu.com/static/captcha/tuxing_v2.html',
        async () => {
            await assert.rejects(searchBaidu('Nginx 官方文档', 3), /Baidu.*verification.*captcha/i);
        }
    );
});

test('Ordinary Baidu results preserve title, link, snippet, source and limit', async () => {
    await withResponse(
        `<html><title>Nginx 百度搜索</title><div id="content_left"><div>
            <h3><a href="https://nginx.org/cn/docs/">nginx documentation</a></h3>
            <div class="cos-row">Nginx configuration and verification reference</div>
            <div class="cosc-source">nginx.org</div>
        </div></div></html>`,
        'https://www.baidu.com/s?wd=nginx',
        async () => {
            assert.deepEqual(await searchBaidu('Nginx 官方文档', 1), [{
                title: 'nginx documentation',
                url: 'https://nginx.org/cn/docs/',
                description: 'Nginx configuration and verification reference',
                source: 'nginx.org',
                engine: 'baidu'
            }]);
        }
    );
});

test('Normal no-result page remains an empty result', async () => {
    await withResponse(
        '<html><title>百度搜索</title><div id="content_left">没有找到相关结果</div></html>',
        'https://www.baidu.com/s?wd=unmatched',
        async () => assert.deepEqual(await searchBaidu('unmatched', 3), [])
    );
});

test('A similar-looking hostname alone is not a Baidu verification redirect', async () => {
    await withResponse(
        '<html><title>No results</title><div id="content_left"></div></html>',
        'https://wappass.baidu.com.example.org/page',
        async () => assert.deepEqual(await searchBaidu('unmatched', 3), [])
    );
});
