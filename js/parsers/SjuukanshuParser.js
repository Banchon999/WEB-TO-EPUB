"use strict";

//dead url/ parser
parserFactory.register("uukanshu.cc", () => new SjuukanshuParser());

class SjuukanshuParser extends Parser {
    constructor() {
        super();
    }

    async getChapterUrls(dom) {
        let menu = dom.querySelector("#list-chapterAll > div");
        return util.hyperlinksToChapterList(menu);
    }

    findContent(dom) {
        return dom.querySelector("body > div.container > div.content > div > div.readcotent.bbb.font-normal");
    }

    extractTitleImpl(dom) {
        return dom.querySelector("body > div.container > div.content > div > h1");
    }

    findChapterTitle(dom) {
        return dom.querySelector("body > div.container > div.content > div > h1");
    }

    findCoverImageUrl(dom) {
        return util.getFirstImgSrc(dom, "div.bookcover.hidden-xs");
    }

    getInformationEpubItemChildNodes(dom) {
        return [...dom.querySelectorAll("body > div.container > div.content > div:nth-child(2) > div.bookinfo > p.bookintro")];
    }
}
