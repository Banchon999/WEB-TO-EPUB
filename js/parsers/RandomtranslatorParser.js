"use strict";

parserFactory.register("randomtranslator.com", () => new RandomtranslatorParser());

class RandomtranslatorParser extends Parser {
    constructor() {
        super();
    }

    static apiBase = "https://randomtranslator.com/api/v1";

    static novelId(dom) {
        // URL is /novel/<id>/<slug>
        return new URL(dom.baseURI).pathname.split("/")[2];
    }

    async getChapterUrls(dom) {
        let id = RandomtranslatorParser.novelId(dom);
        let list = (await HttpClient.fetchJson(`${RandomtranslatorParser.apiBase}/novels/${id}/chapters`)).json;
        let chapterssorted = [...list].sort((a,b) => a.sequence_number - b.sequence_number);
        let chapters = chapterssorted.map(a => ({
            sourceUrl:  "https://www.randomtranslator.com/chapter/"+a.id,
            title: a.translated_title,
            isIncludeable: !a.is_restricted    
        }));
        return chapters;
    }
    
    async loadEpubMetaInfo(dom) {
        let id = RandomtranslatorParser.novelId(dom);
        let bookinfo = (await HttpClient.fetchJson(`${RandomtranslatorParser.apiBase}/novels/${id}`)).json;
        this.title = bookinfo.translated_title;
        this.author = bookinfo.translated_author;
        this.tags = bookinfo.tags.map(a => a.translated_name);
        this.tags = this.tags.concat(bookinfo.translated_category);
        this.description = bookinfo.ai_description ?? bookinfo.translated_description ?? "";
        this.img = bookinfo.image_url;
        return;
    }

    extractTitleImpl() {
        return this.title;
    }

    extractAuthor() {
        return this.author;
    }

    extractSubject() {
        let tags = this.tags;
        return tags.join(", ");
    }

    extractDescription() {
        return this.description.trim();
    }

    findCoverImageUrl() {
        return this.img;
    }

    findContent(dom) {
        return Parser.findConstrutedContent(dom);
    }

    async fetchChapter(url) {
        let restUrl = this.toRestUrl(url);
        let json = (await HttpClient.fetchJson(restUrl)).json;
        return this.buildChapter(json, url);
    }

    toRestUrl(url) {
        let leaves = url.split("/");
        let id = leaves[leaves.length - 1];
        return `${RandomtranslatorParser.apiBase}/chapters/${id}`;
    }

    buildChapter(json, url) {
        let newDoc = Parser.makeEmptyDocForContent(url);
        let title = newDoc.dom.createElement("h1");
        title.textContent = json.translated_title;
        newDoc.content.appendChild(title);
        // content used to be one string, it is now a list of {type, content} blocks
        let text = Array.isArray(json.translated_content)
            ? json.translated_content.filter(b => b.type === "text").map(b => b.content)
            : (json.translated_content ?? "").replace("\n\n", "\n").split("\n");
        let br = newDoc.dom.createElement("br");
        for (let element of text) {
            let pnode = newDoc.dom.createElement("p");
            pnode.textContent = element;
            newDoc.content.appendChild(pnode);
            newDoc.content.appendChild(br);
        }
        return newDoc.dom;
    }
}
