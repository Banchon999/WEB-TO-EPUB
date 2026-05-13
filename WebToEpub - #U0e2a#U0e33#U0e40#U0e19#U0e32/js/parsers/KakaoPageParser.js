"use strict";

/*
    Parser for page.kakao.com (new Kakao Page site)
    Handles series/novel pages: https://page.kakao.com/content/{seriesId}

    API response structures (confirmed):
    - Chapter list: result.list[].item.product_id / title / is_free
    - Pagination:   result.has_next, last item's cursor_index
    - Metadata:     result.series_item.title / authors / description / thumbnail
    - Content JSON: contentInfo.paragraphList (from signed CDN URL — needs viewer page data)
*/

parserFactory.registerUrlRule(
    url => KakaoPageParser.isValidUrl(url),
    () => new KakaoPageParser()
);

class KakaoPageParser extends Parser {
    constructor() {
        super();
        this.minimumThrottle = 1000;
        this.maxSimultanousFetchSize = 1;
        this._seriesItem = null; // cached from chapter list API
    }

    // -------------------------------------------------------------------------
    // URL detection
    // -------------------------------------------------------------------------

    static isValidUrl(url) {
        if (!url.includes("page.kakao.com")) return false;
        if (!url.includes("/content/")) return false;
        if (url.includes("/viewer/")) return false;
        return /\/content\/\d+/.test(url);
    }

    static extractSeriesId(url) {
        let m = String(url).match(/\/content\/(\d+)/);
        return m ? m[1] : null;
    }

    static extractProductId(url) {
        let m = String(url).match(/\/viewer\/(\d+)/);
        return m ? m[1] : null;
    }

    // -------------------------------------------------------------------------
    // Fetch via page context — runs fetch inside the page.kakao.com tab so that
    // Origin / Sec-Fetch-Site / cookies are all correct (extension origin is rejected)
    // -------------------------------------------------------------------------

    // WebToEpub opens as a tab: popup.html?id={originalTabId}
    // The original Kakao tab ID is in the query string, not the "active" tab.
    static getKakaoTabId() {
        let m = window.location.search.match(/[?&]id=(\d+)/);
        if (m) return Promise.resolve(parseInt(m[1], 10));
        // Fallback for edge cases
        return new Promise((resolve, reject) => {
            chrome.tabs.query({ currentWindow: true, active: true }, tabs => {
                if (tabs && tabs.length > 0) resolve(tabs[0].id);
                else reject(new Error("KakaoPageParser: no tab found."));
            });
        });
    }

    // Inject a fetch into the page's MAIN world and return the parsed JSON.
    static async fetchJsonInPageContext(url) {
        let tabId = await KakaoPageParser.getKakaoTabId();
        let results = await chrome.scripting.executeScript({
            target: { tabId: tabId },
            world: "MAIN",
            func: async (fetchUrl) => {
                let r = await fetch(fetchUrl, {
                    credentials: "include",
                    headers: { "accept": "application/json, text/plain, */*" }
                });
                if (!r.ok) throw new Error("HTTP " + r.status + " " + fetchUrl);
                return r.json();
            },
            args: [url]
        });
        let entry = results?.[0];
        if (entry?.error) throw new Error(entry.error.message ?? String(entry.error));
        return entry.result;
    }

    // -------------------------------------------------------------------------
    // Metadata extraction — prefer __NEXT_DATA__, fallback to DOM
    // -------------------------------------------------------------------------

    extractTitleImpl(dom) {
        let nd = KakaoPageParser.getNextData(dom);
        let title = nd?.props?.pageProps?.initialProps?.metaInfo?.ogTitle
            ?? nd?.props?.pageProps?.initialProps?.dehydratedState?.queries?.[0]
                ?.state?.data?.contentHomeOverview?.content?.title;
        if (title) return title.trim();
        // DOM fallback
        let el = dom.querySelector("span.font-large3-bold");
        if (el) return el.textContent.trim();
        return Parser.extractTitleDefault(dom);
    }

    extractAuthor(dom) {
        let nd = KakaoPageParser.getNextData(dom);
        let author = nd?.props?.pageProps?.initialProps?.metaInfo?.author
            ?? nd?.props?.pageProps?.initialProps?.dehydratedState?.queries?.[0]
                ?.state?.data?.contentHomeOverview?.content?.authors;
        if (author) return author.trim();
        // DOM fallback
        let el = dom.querySelector("span.font-small2.mb-6pxr");
        if (el) return el.textContent.trim();
        let meta = dom.querySelector('meta[name="author"]');
        if (meta) return meta.getAttribute("content") || "<unknown>";
        return "<unknown>";
    }

    extractDescription(dom) {
        let nd = KakaoPageParser.getNextData(dom);
        let desc = nd?.props?.pageProps?.initialProps?.dehydratedState?.queries?.[0]
            ?.state?.data?.contentHomeOverview?.content?.description;
        if (desc) return desc.trim();
        // DOM fallback
        let el = dom.querySelector(
            "span.font-small1.mb-8pxr.block.whitespace-pre-wrap.break-words.text-el-70"
        );
        return el?.textContent?.trim() ?? "";
    }

    findCoverImageUrl(dom) {
        let nd = KakaoPageParser.getNextData(dom);
        let thumb = nd?.props?.pageProps?.initialProps?.dehydratedState?.queries?.[0]
            ?.state?.data?.contentHomeOverview?.content?.thumbnail;
        if (thumb) return thumb.startsWith("//") ? "https:" + thumb : thumb;
        let meta = dom.querySelector('meta[property="og:image"]');
        return meta ? meta.getAttribute("content") : null;
    }

    static getNextData(dom) {
        try {
            let el = dom.querySelector("script#__NEXT_DATA__");
            return el ? JSON.parse(el.textContent) : null;
        } catch (e) {
            return null;
        }
    }

    // -------------------------------------------------------------------------
    // Chapter list — bff-page API (paginated, confirmed field paths)
    // -------------------------------------------------------------------------

    async getChapterUrls(dom) {
        let seriesId = KakaoPageParser.extractSeriesId(dom.baseURI || "");
        if (!seriesId) {
            throw new Error("KakaoPageParser: Could not extract series ID from URL.");
        }

        let chapterList = [];
        // Start from beginning; cursor_index=0 + NEXT returns from the first item
        let cursorIndex = 0;
        const windowSize = 25;
        const listApiBase =
            "https://bff-page.kakao.com/api/gateway/api/v2/content/product/list";

        while (true) {
            let apiUrl =
                `${listApiBase}?series_id=${seriesId}` +
                `&cursor_index=${cursorIndex}` +
                `&cursor_direction=NEXT` +
                `&window_size=${windowSize}` +
                `&sort_type=asc`;

            let json = await KakaoPageParser.fetchJsonInPageContext(apiUrl);

            // Confirmed structure: json.result.list[]
            let result = json?.result;
            let list = result?.list ?? [];
            if (list.length === 0) break;

            // Cache series_item for metadata use
            if (!this._seriesItem && result?.series_item) {
                this._seriesItem = result.series_item;
            }

            for (let entry of list) {
                let item = entry.item;
                if (!item) continue;

                let productId = item.product_id;
                let title = (item.title ?? String(chapterList.length + 1)).trim();

                if (productId) {
                    chapterList.push({
                        sourceUrl: `https://page.kakao.com/content/${seriesId}/viewer/${productId}`,
                        title: title,
                        newArc: null,
                    });
                }

                // Track cursor for pagination
                cursorIndex = entry.cursor_index ?? cursorIndex;
            }

            // has_next=false means we got all chapters
            if (!result?.has_next) break;
        }

        return chapterList;
    }

    // -------------------------------------------------------------------------
    // Chapter content — pending viewer page API info
    // Flow: get signed CDN URL from viewer API → fetch content JSON
    //       → parse contentInfo.paragraphList
    // -------------------------------------------------------------------------

    async fetchChapter(url) {
        let seriesId = KakaoPageParser.extractSeriesId(url);
        let productId = KakaoPageParser.extractProductId(url);

        // Step 1: get signed content URL from viewer API (TODO: fill in once we have the endpoint)
        if (seriesId && productId) {
            try {
                let doc = await this.fetchChapterViaViewerApi(url, seriesId, productId);
                if (doc) return doc;
            } catch (e) { /* fall through */ }
        }

        // Step 2: fallback — fetch HTML and look for embedded data
        let response = await HttpClient.wrapFetch(url, KakaoPageParser.bffFetchOptions());
        let htmlDom = response.responseXML;
        return this.buildDocFromHtml(url, htmlDom);
    }

    // Confirmed endpoint: bff-page.kakao.com/api/gateway/api/v1/viewer/data
    // Returns atsServerUrl (CDN base) + contentsList[].secureUrl (per-chunk signed path)
    async fetchChapterViaViewerApi(sourceUrl, seriesId, productId) {
        let apiUrl =
            `https://bff-page.kakao.com/api/gateway/api/v1/viewer/data` +
            `?series_id=${seriesId}&product_id=${productId}`;

        let json = await KakaoPageParser.fetchJsonInPageContext(apiUrl);

        let viewerData = json?.viewerData;
        if (!viewerData || viewerData.type !== "TextViewerData") return null;

        // atsServerUrl = "https://dn-img-page.kakao.com/sdownload/resource?kid="
        let atsServerUrl = viewerData.atsServerUrl ?? "";
        let contentsList = viewerData.contentsList ?? [];
        if (!atsServerUrl || contentsList.length === 0) return null;

        let title = json?.item?.title ?? "";

        // Fetch every content chunk and merge all paragraphs
        let allParagraphs = [];
        for (let chunk of contentsList) {
            let contentUrl = atsServerUrl + chunk.secureUrl;
            try {
                let chunkJson = await KakaoPageParser.fetchJsonInPageContext(contentUrl);
                let paragraphs = chunkJson?.contentInfo?.paragraphList ?? [];
                allParagraphs = allParagraphs.concat(paragraphs);
            } catch (e) { /* skip failed chunks */ }
        }

        if (allParagraphs.length === 0) return null;
        return this.buildDocFromParagraphList(sourceUrl, title, allParagraphs);
    }

    // -------------------------------------------------------------------------
    // Parse Kakao's paragraphList content JSON → DOM doc
    // (confirmed format from dn-img-page.kakao.com content JSON)
    // -------------------------------------------------------------------------

    buildDocFromParagraphList(sourceUrl, title, paragraphList) {
        let doc = Parser.makeEmptyDocForContent(sourceUrl);

        if (title) {
            let h1 = doc.dom.createElement("h1");
            h1.textContent = title;
            doc.content.appendChild(h1);
        }

        for (let para of paragraphList) {
            if (!para || para.type !== "P") continue;

            let children = para.childParagraphList;
            if (!children || children.length === 0) {
                // Empty paragraph — add a blank line
                doc.content.appendChild(doc.dom.createElement("br"));
                continue;
            }

            // Collect all text from child nodes
            let lineText = "";
            for (let child of children) {
                if (child.type === "BR") {
                    lineText += "\n";
                } else if (child.text) {
                    // Decode HTML entities (e.g. &nbsp; &lt; &gt;)
                    let txt = child.text
                        .replace(/&nbsp;/g, " ")
                        .replace(/&lt;/g, "<")
                        .replace(/&gt;/g, ">")
                        .replace(/&amp;/g, "&")
                        .replace(/&quot;/g, '"');
                    lineText += txt;
                }
            }

            lineText = lineText.trim();
            if (lineText) {
                let p = doc.dom.createElement("p");
                p.textContent = lineText;
                doc.content.appendChild(p);
            }
        }

        return doc.content.querySelector("p") ? doc.dom : null;
    }

    // -------------------------------------------------------------------------
    // Fallback: build doc from viewer HTML page
    // -------------------------------------------------------------------------

    buildDocFromHtml(url, htmlDom) {
        let doc = Parser.makeEmptyDocForContent(url);

        let ogTitle =
            htmlDom.querySelector('meta[property="og:title"]')?.getAttribute("content") ?? "";
        if (ogTitle) {
            let h1 = doc.dom.createElement("h1");
            h1.textContent = ogTitle;
            doc.content.appendChild(h1);
        }

        // Placeholder message
        let p = doc.dom.createElement("p");
        p.textContent =
            "⚠ Chapter content could not be extracted automatically. " +
            "Kakao viewer requires a signed CDN URL. " +
            "Please provide the viewer API endpoint.";
        doc.content.appendChild(p);

        return doc.dom;
    }

    // -------------------------------------------------------------------------
    // epub helpers
    // -------------------------------------------------------------------------

    findContent(dom) {
        return Parser.findConstrutedContent(dom) ?? dom.querySelector("div.webToEpubContent");
    }

    findChapterTitle(dom) {
        return dom.querySelector("h1");
    }
}
