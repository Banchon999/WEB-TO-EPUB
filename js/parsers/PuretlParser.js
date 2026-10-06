"use strict";

parserFactory.register("puretl.com", () => new PuretlParser());

class PuretlParser extends Parser {
    constructor() {
        super();
    }

    async getChapterUrls(dom) {
        let menu = dom.querySelector("ul.accordion-items-container")
            || dom.querySelector("ul.archive-group-list");
        // skip archive filter links such as "?year=2022"
        return util.hyperlinksToChapterList(menu, a => a.search === "");
    }

    findContent(dom) {
        return [...dom.querySelectorAll("div.sqs-html-content")][1];
    }

    extractTitleImpl(dom) {
        return dom.querySelector(".content .sqs-html-content p");
    }

    findChapterTitle(dom) {
        return dom.querySelector("h1");
    }

    getInformationEpubItemChildNodes(dom) {
        return [...dom.querySelectorAll(".content .sqs-html-content")];
    }
}
