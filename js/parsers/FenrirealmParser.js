"use strict";

parserFactory.register("fenrirealm.com", () => new FenrirealmParser());

class FenrirealmParser extends Parser {
    constructor() {
        super();
    }

    async getChapterUrls(dom) {
        // the page only renders one range of chapters, the API returns all of them
        let slug = new URL(dom.baseURI).pathname.split("/")[2];
        try {
            let chapters = (await HttpClient.fetchJson(`https://fenrirealm.com/api/new/v2/series/${slug}/chapters`)).json;
            if (Array.isArray(chapters) && 0 < chapters.length) {
                return chapters.map(c => ({
                    sourceUrl: `https://fenrirealm.com/series/${slug}/${c.slug}`,
                    title: [c.name, c.title].filter(t => t).map(t => t.trim()).join(": "),
                    isIncludeable: (c.locked?.price ?? 0) === 0 || c.locked?.unlocked_at != null
                }));
            }
        } catch (err) {
            // fall back to chapters rendered on the page
        }
        let menu = dom.querySelector(".grid-chapter");
        return [...menu.querySelectorAll("a")]
            .map(a => this.hyperLinkToChapter(a))
            .reverse();
    }

    hyperLinkToChapter(link) {
        return ({
            sourceUrl:  link.href,
            title: link.querySelector("span").textContent.trim(),
        });
    }

    findContent(dom) {
        return dom.querySelector("[id^='reader-area-']");
    }

    extractTitleImpl(dom) {
        return dom.querySelector(".main-area > .container h1");
    }

    findChapterTitle(dom) {
        let titleElement = dom.querySelector(".chapter-view h2, h1");
        if (titleElement === null) {
            return null;
        }
        return this.removeDuplicatedChapterPrefix(titleElement.textContent.trim());
    }

    removeDuplicatedChapterPrefix(titleText) {
        let parts = titleText.split(":");
        return (parts.length >= 2) && (parts[0].trim() === parts[1].trim())
            ? parts.slice(1).join(":")
            : titleText;
    }

    findCoverImageUrl(dom) {
        let img = dom.querySelector(".main-area .container:nth-of-type(2) img:nth-of-type(2)");
        return img?.src || null;
    }

    getInformationEpubItemChildNodes(dom) {
        return [...dom.querySelectorAll(".synopsis")];
    }
}
