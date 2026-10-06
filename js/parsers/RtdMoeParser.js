"use strict";

parserFactory.register("rtd.moe", () => new RtdMoeParser());

class RtdMoeParser extends Parser {
    constructor() {
        super();
    }

    getChapterUrls(dom) {
        // current layout: table of chapters, newest first
        let links = [...dom.querySelectorAll("table a[href*='/chapters/']")];
        if (0 < links.length) {
            return Promise.resolve(links.map(a => util.hyperLinkToChapter(a)).reverse());
        }
        let menu = this.findContent(dom);
        return Promise.resolve(util.hyperlinksToChapterList(menu));
    }

    findContent(dom) {
        return dom.querySelector("div#content")
            || dom.querySelector("div.chapter-content");
    }

    extractTitleImpl(dom) {
        return dom.querySelector("h1");
    }

    removeUnwantedElementsFromContentElement(element) {
        util.removeChildElementsMatchingSelector(element, "div.wp-post-navigation, div.tags, table#amazon-polly-audio-table");
        super.removeUnwantedElementsFromContentElement(element);
    }

    findChapterTitle(dom) {
        return dom.querySelector("h1");
    }
}
