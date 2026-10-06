"use strict";

parserFactory.register("gunnerkrigg.com", () => new GunnerkriggParser());

class GunnerkriggParser extends Parser {
    constructor() {
        super();
    }

    async getChapterUrls(dom) {
        return [...dom.querySelectorAll("select[name='page'] option")]
            .map(this.optionToChapter);
    }

    optionToChapter(option) {
        return {
            sourceUrl:  "https://www.gunnerkrigg.com/?p=" + option.value,
            title: option.textContent.trim(),
        };
    }

    findContent(dom) {
        let content = dom.querySelector("div.comic, main.comic > div.inner");
        if (content !== null) {
            util.removeChildElementsMatchingSelector(content, ".nav, .extra");
        }
        return content;
    }

    customRawDomToContentStep(chapter, content) {
        // comic image is wrapped in a link to the next page, which "remove next/previous links" would delete
        for (let link of [...content.querySelectorAll("a")].filter(a => a.querySelector("img") !== null)) {
            link.replaceWith(...link.childNodes);
        }
    }
}
