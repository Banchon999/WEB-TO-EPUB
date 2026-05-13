"use strict";

parserFactory.registerUrlRule(
    url => util.extractHostName(url).startsWith("novelpia"),
    () => new NovelpiaParser()
);

class NovelpiaParser extends Parser {
    constructor() {
        super();
        this.minimumThrottle = 1500;
    }

    async getChapterUrls(dom) {
        let baseUrl = new URL(dom.baseURI).origin;

        // ดึง novel_no จาก URL เช่น /novel/251984
        let novelNo = dom.baseURI.match(/\/novel\/(\d+)/)?.[1];
        if (!novelNo) return [];

        // ดึงหน้า 0 เพื่อหาจำนวนหน้าทั้งหมด (0-based)
        let firstDoc = await this.fetchEpisodePage(novelNo, 0);
        let totalPages = this.getTotalPages(firstDoc); // เช่น 37

        // ดึงหน้าที่เหลือ (1 ถึง totalPages-1)
        let allDocs = [firstDoc];
        if (totalPages > 1) {
            let pagePromises = [];
            for (let page = 1; page < totalPages; page++) {
                pagePromises.push(this.fetchEpisodePage(novelNo, page));
            }
            let moreDocs = await Promise.all(pagePromises);
            allDocs = allDocs.concat(moreDocs);
        }

        // แต่ละหน้าเรียงใหม่→เก่า, หน้า 0 = ใหม่สุด
        // flatMap ตามลำดับหน้า แล้ว reverse ทั้งหมดให้ได้เก่า→ใหม่
        return allDocs
            .flatMap(doc => [...doc.querySelectorAll("tr.ep_style5 td[onclick]")])
            .map(td => this.tdToChapter(td, baseUrl))
            .filter(ch => ch !== null)
            .reverse();
    }

    async fetchEpisodePage(novelNo, page) {
        // page เป็น 0-based ตาม localStorage ของ Novelpia
        let apiUrl = "https://novelpia.com/proc/episode_list";
        let fetchOptions = {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: `novel_no=${novelNo}&sort=DOWN&page=${page}`
        };
        let text = await fetch(apiUrl, fetchOptions).then(r => r.text());
        return new DOMParser().parseFromString(text, "text/html");
    }

    getTotalPages(doc) {
        // ปุ่ม next (→) มี onclick ที่บอก index หน้าสุดท้าย
        // เช่น localStorage['novel_page_251984'] = '36' → 37 หน้า
        let links = [...doc.querySelectorAll(".page-link")];
        let lastLink = links[links.length - 1]; // ปุ่ม → อยู่สุดท้าย
        let match = lastLink?.getAttribute("onclick")?.match(/'(\d+)'/);
        if (match) return parseInt(match[1]) + 1;

        // fallback: อ่านตัวเลขสูงสุดจาก page-link
        let pages = links
            .map(el => parseInt(el.textContent.trim()))
            .filter(n => !isNaN(n));
        return pages.length > 0 ? Math.max(...pages) : 1;
    }

    tdToChapter(td, baseUrl) {
        let onclick = td.getAttribute("onclick") || "";
        let match = onclick.match(/location\s*=\s*'([^']+)'/);
        if (!match) return null;

        // ดึงหมายเลข EP จาก span badge เช่น "EP.1" ที่อยู่ใน td เดียวกัน
        let epBadge = td.querySelector("span[style*='border-radius']");
        let epNum = epBadge?.textContent?.trim() ?? "";

        let titleEl = td.querySelector("b");
        if (!titleEl) return null;
        // ลบ badge ทุกประเภท (PLUS, 무료, 유료 ฯลฯ)
        util.removeChildElementsMatchingSelector(titleEl, "span");
        util.removeChildElementsMatchingSelector(titleEl, "i");
        let chapterTitle = titleEl.textContent.trim();

        // รวม EP number กับชื่อตอน เช่น "EP.1 - 아니 내 눈이"
        let title = epNum ? `${epNum} - ${chapterTitle}` : chapterTitle;

        return {
            sourceUrl: baseUrl + match[1],
            title: title
        };
    }

async fetchChapter(url) {
    let episodeNo = url.split("/").pop();

    // เซ็ต REF_DATA cookie ให้ตรงกับ episode (server เช็คค่านี้)
    await chrome.cookies.set({
        url: "https://novelpia.com",
        name: "REF_DATA",
        value: `%2Fviewer%2F${episodeNo}`,
        domain: "novelpia.com",
        path: "/"
    });

    let tabs = await chrome.tabs.query({ url: "https://novelpia.com/*" });
    if (!tabs.length) throw new Error("กรุณาเปิด novelpia.com ไว้ในเบราว์เซอร์");

    // ส่ง referrer ผ่าน fetch option (same-origin URL ทำได้ตาม spec)
    // → browser จะ set Referer header ให้อัตโนมัติ
    let results = await chrome.scripting.executeScript({
        target: { tabId: tabs[0].id },
        func: async (episodeNo, referer) => {
            const opts = (body) => ({
                method: "POST",
                credentials: "include",
                referrer: referer,
                headers: {
                    "Accept": "application/json, text/javascript, */*; q=0.01",
                    "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
                    "X-Requested-With": "XMLHttpRequest"
                },
                body
            });

            // ขั้น 1: register view ก่อน (viewer page เรียก API นี้เสมอก่อน viewer_data)
            let viewerReadRes = await fetch("https://novelpia.com/proc/novel_viewer",
                opts(`cmd=viewer_read&episode_no=${episodeNo}&read_cnt=1`)
            ).catch(() => null);
            let viewerReadJson = null;
            if (viewerReadRes) {
                try { viewerReadJson = await viewerReadRes.clone().json(); } catch(_) {}
            }

            // ขั้น 2: ดึง content (retry ถ้าได้ 500 เพราะ Novelpia server flaky)
            const sleep = ms => new Promise(res => setTimeout(res, ms));
            const maxAttempts = 10;
            for (let attempt = 0; attempt < maxAttempts; attempt++) {
                if (attempt > 0) await sleep(3000);
                try {
                    let r = await fetch(
                        `https://novelpia.com/proc/viewer_data/${episodeNo}`,
                        opts("size=14")
                    );
                    let text = await r.text();
                    if (r.status === 500 && attempt < maxAttempts - 1) continue;
                    return JSON.stringify({ status: r.status, text, viewerReadErr: viewerReadJson?.err_code ?? null });
                } catch(e) {
                    if (attempt < maxAttempts - 1) continue;
                    return JSON.stringify({ status: 0, text: "", error: e.message });
                }
            }
        },
        args: [episodeNo, `https://novelpia.com/viewer/${episodeNo}`]
    });

    let raw = results?.[0]?.result;
    if (!raw) throw new Error(`Episode ${episodeNo}: no result`);
    let { status, text, error, viewerReadErr } = JSON.parse(raw);
    if (error) throw new Error(`Episode ${episodeNo}: ${error}`);
    if (status !== 200) {
        let hint = viewerReadErr ? ` | viewer_read: ${viewerReadErr}` : "";
        let body = text ? ` | body: ${text.slice(0, 200)}` : "";
        throw new Error(`Episode ${episodeNo}: HTTP ${status}${hint}${body}`);
    }
    let json = JSON.parse(text);
    return this.jsonToHtml(url, json);
}


jsonToHtml(pageUrl, json) {
    let newDoc = Parser.makeEmptyDocForContent(pageUrl);

    let html = (json.s || []).map(item => {
        let raw = item.text || "";

        // ── ลบ watermark hidden <p> ที่ Novelpia แอบแทรก (Base64 + opacity:0) ──
        raw = raw.replace(/<p[^>]*opacity\s*:\s*0[^>]*>[\s\S]*?<\/p>/gi, "");

        // ── จัดการ <img> → ให้ผ่านไปเป็น <img> จริง ไม่ใช่ text ──
        const imgMatch = raw.match(/<img[^>]*src=["']?(\/\/[^"' >]+)["']?[^>]*>/i);
        if (imgMatch) {
            // เติม https: ถ้า src ขึ้นต้นด้วย //
            const src = imgMatch[1].startsWith("//") ? "https:" + imgMatch[1] : imgMatch[1];
            return `<div><img src="${src}" style="max-width:100%"/></div>`;
        }

        // ── normalize ──
        let text = raw
            .replace(/&nbsp;/g, " ")
            .replace(/\r/g, "");

        // ── บรรทัดว่าง (space/newline ล้วน) → คั่น paragraph ──
        if (/^\s*\n+$/.test(text) || !text.trim()) {
            return "<br>";
        }

        // ── ตัด trailing whitespace ก่อนแปลง newline ──
        text = text
            .replace(/[ \t]+$/gm, "")   // ตัด trailing space/tab ท้ายแต่ละบรรทัด
            .replace(/\n+/g, "<br>")
            .trim();

        return "<div>" + text + "</div>";
    }).join("");

    let content = util.sanitize("<div>" + html + "</div>");
    util.moveChildElements(content.body, newDoc.content);

    return newDoc.dom;
}
    findContent(dom) {
        return dom.querySelector("div");
    }

    removeUnwantedElementsFromContentElement(element) {
        util.removeChildElementsMatchingSelector(element, "div.cover-wrapper");
        util.removeChildElementsMatchingSelector(element, "div.cover-text");
        util.removeChildElementsMatchingSelector(element, "p[style*='opacity']");
        super.removeUnwantedElementsFromContentElement(element);
    }

    extractTitleImpl(dom) {
        return dom.querySelector("div.epnew-novel-title");
    }

    findChapterTitle(dom) {
        return dom.querySelector("b");
    }

    findCoverImageUrl(dom) {
        return util.getFirstImgSrc(dom, "div.epnew-cover-box");
    }

    getInformationEpubItemChildNodes(dom) {
        let synopsis = dom.querySelector("div.synopsis");
        return synopsis ? [synopsis] : [];
    }
}