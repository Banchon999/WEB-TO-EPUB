"use strict";

parserFactory.register("novelonomicon.com", () => new NovelonomiconParser());

class NovelonomiconParser extends Parser {
    constructor() {
        super();
    }

    async getChapterUrls(dom, chapterUrlsUI) {
        return (await this.getChapterUrlsFromMultipleTocPages(dom,
            this.extractPartialChapterList,
            this.getUrlsOfTocPages,
            chapterUrlsUI
        )).reverse();
    }

    getUrlsOfTocPages(dom) {
        // current theme: <ul class="pages-numbers"> with links to .../page/N/
        let pageNumber = (a) => parseInt(a.href.match(/\/page\/(\d+)\/?$/)?.[1] ?? "0");
        let pageLinks = [...dom.querySelectorAll(".pages-numbers a")];
        if (0 < pageLinks.length) {
            let max = Math.max(...pageLinks.map(pageNumber));
            let base = pageLinks[0].href.replace(/page\/\d+\/?$/, "");
            let urls = [];
            for (let i = 2; i <= max; ++i) {
                urls.push(`${base}page/${i}/`);
            }
            return urls;
        }

        // older theme
        let urls = [];
        let lastLink = dom.querySelector(".page-nav a.last")
            || [...dom.querySelectorAll(".page-nav a.page")].slice(-1)[0];
        if (lastLink)
        {
            let max = parseInt(lastLink.textContent);
            let href = lastLink.href;
            let index = href.lastIndexOf("/", href.length - 2);
            href = href.substring(0, index + 1);
            for (let i = 2; i <= max; ++i) {
                urls.push(href + i + "/");
            }
        }
        return urls;
    }

    extractPartialChapterList(dom) {
        return [...dom.querySelectorAll(".td-block-span6 h3 a, .entry-archives-header h2.entry-title a")]
            .map(a => util.hyperLinkToChapter(a));
    }

    findContent(dom) {
        return dom.querySelector(".tdi_48 .wpb_wrapper .tdb_single_content")
            || dom.querySelector(".entry-content");
    }

    removeUnwantedElementsFromContentElement(element) {
        util.removeChildElementsMatchingSelector(element, ".stream-item, .da-reactions-outer, .share-links");
        // ad banners: images linking to other sites
        let isExternal = (a) => a.hostname && !a.hostname.endsWith("novelonomicon.com");
        util.removeElements([...element.querySelectorAll("a")].filter(a => isExternal(a) && a.querySelector("img")));
        super.removeUnwantedElementsFromContentElement(element);
    }

    extractTitleImpl(dom) {
        return dom.querySelector("h1");
    }

    findChapterTitle(dom) {
        return dom.querySelector("h1");
    }

    findCoverImageUrl(dom) {
        return util.getFirstImgSrc(dom, ".td-module-image a");
    }
    
    getInformationEpubItemChildNodes(dom) {
        return [...dom.querySelectorAll(".td-category-description")];
    }

    cleanInformationNode(node) {
        util.removeChildElementsMatchingSelector(node, ".su-spoiler");
        return node;
    }    
}
