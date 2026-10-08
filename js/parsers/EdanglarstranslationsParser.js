"use strict";

parserFactory.register("edanglarstranslations.com", () => new EdanglarstranslationsParser());

class EdanglarstranslationsParser extends Parser {
    constructor() {
        super();
    }

    async getChapterUrls(dom) {
        // TOC also links to downloadable files (pdf/epub/mobi), raws and anchors; keep only chapter pages
        let novelPath = new URL(dom.baseURI).pathname.replace(/\/$/, "");
        let isChapter = (a) => a.hostname.replace(/^www\./, "") === "edanglarstranslations.com"
            && a.pathname.startsWith(novelPath + "/")
            && !a.pathname.startsWith("/sites/")
            && a.hash === "";
        return [...dom.querySelectorAll("article a")]
            .filter(isChapter)
            .map(a => util.hyperLinkToChapter(a))
            .map(c => ({...c, sourceUrl: c.sourceUrl.replace(/^http:/, "https:")}));
    }

    findContent(dom) {
        return dom.querySelector("article div[property='schema:text']");
    }

    extractTitleImpl(dom) {
        return dom.querySelector("h1");
    }

    getInformationEpubItemChildNodes(dom) {
        return [...dom.querySelectorAll("p")];
    }
}
