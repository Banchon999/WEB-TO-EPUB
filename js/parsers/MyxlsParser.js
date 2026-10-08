"use strict";

parserFactory.register("myxls.net", () => new MyxlsParser());

class MyxlsParser extends Parser {
    constructor() {
        super();
    }

    async getChapterUrls(dom) {
        // current layout: <div id="directoryList"><ul><li><a>
        let directory = [...dom.querySelectorAll("#directoryList a")];
        if (0 < directory.length) {
            return directory.map(a => util.hyperLinkToChapter(a));
        }
        let rows = dom.querySelector("div#list dl")?.children ?? [];
        let links = [];
        let count = 0;
        for (let row of rows) {
            let tag = row.tagName.toLowerCase();
            if (tag === "dt") {
                ++count;
            }
            if ((tag === "dd") && (count === 2)) {
                links.push(row.querySelector("a"));
            }
        }
        return links.map(a => util.hyperLinkToChapter(a));
    }

    findContent(dom) {
        return dom.querySelector("#content")
            || dom.querySelector("div#txt");
    }

    extractTitleImpl(dom) {
        return dom.querySelector("h1");
    }

    findChapterTitle(dom) {
        return dom.querySelector(".bookname h1")?.textContent ?? null;
    }

    findCoverImageUrl(dom) {
        return util.getFirstImgSrc(dom, "#fmimg");
    }

    getInformationEpubItemChildNodes(dom) {
        return [...dom.querySelectorAll("#intro")];
    }
}
