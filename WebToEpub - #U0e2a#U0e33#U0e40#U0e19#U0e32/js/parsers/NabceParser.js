"use strict";

parserFactory.register("nabce.net", () => new NabceParser());

class NabceParser extends Parser {
    constructor() {
        super();
    }

    async getChapterUrls(dom) {
        return NabceParser.fetchRestOfToc(dom, []);
    }

    static async fetchRestOfToc(dom, chapterList) {
        let newChapters = NabceParser.extractPartialChapterList(dom);
        chapterList = chapterList.concat(newChapters);
        let nextPageUrl = NabceParser.findNextPageUrl(dom);
        if (nextPageUrl === null) {
            return chapterList;
        }
        let xhr = await HttpClient.wrapFetch(nextPageUrl);
        return NabceParser.fetchRestOfToc(xhr.responseXML, chapterList);
    }

    static extractPartialChapterList(dom) {
        return [...dom.querySelectorAll("div.flex.items-center.justify-between h3 a")]
            .map(link => ({ sourceUrl: link.href, title: link.textContent.trim() }));
    }

    static findNextPageUrl(dom) {
        let nextLink = [...dom.querySelectorAll("a[href*='chapters_page']")]
            .find(a => a.textContent.trim().startsWith("Next"));
        return nextLink ? nextLink.href : null;
    }

    findContent(dom) {
        return dom.querySelector(".mb-8");
    }

    extractTitleImpl(dom) {
        return dom.querySelector(".mb-2");
    }

    extractAuthor(dom) {
        let authorLink = dom.querySelector("a[href*='novel-author']");
        return authorLink ? authorLink.textContent.trim() : super.extractAuthor(dom);
    }

    extractDescription(dom) {
        let descHeader = [...dom.querySelectorAll("h2")]
            .find(h => h.textContent.trim() === "Description");
        if (!descHeader) {
            return "";
        }
        let sibling = descHeader.nextElementSibling;
        return sibling ? sibling.textContent.trim() : "";
    }

    findCoverImageUrl(dom) {
        let img = dom.querySelector("img.object-cover");
        return img ? img.src : null;
    }
}
