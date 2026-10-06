"use strict";

parserFactory.register("snowycodex.com", () => new SnowyCodexParser());

class SnowyCodexParser extends WordpressBaseParser {
    constructor() {
        super();
    }

    async getChapterUrls(dom, chapterUrlsUI) {
        // story pages also link to the raws (e.g. jjwxc.net); keep only this site's chapters
        return (await super.getChapterUrls(dom, chapterUrlsUI))
            .filter(c => new URL(c.sourceUrl).hostname.endsWith("snowycodex.com"));
    }

    extractTitleImpl(dom) {
        return dom.querySelector("div.entry-content h2");
    }

    getInformationEpubItemChildNodes(dom) {
        return [...dom.querySelectorAll("div.entry-content p")];
    }
}
