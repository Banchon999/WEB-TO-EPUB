"use strict";

parserFactory.register("estar.jp", () => new EstarParser());

class EstarParser extends Parser {
    constructor() {
        super();
    }

    async getChapterUrls(dom) {
        let rule = 
        [{
            "id": 1,
            "priority": 1,
            "action": {
                "type": "modifyHeaders",
                "requestHeaders": [{ "header": "origin", "operation": "remove" }]
            },
            "condition": { "urlFilter" : "estar.jp"}
        }];
        await HttpClient.setDeclarativeNetRequestRules(rule);

        let leaves = dom.baseURI.split("/");
        let id = leaves[leaves.length - 1];
        let fetchUrl = "https://estar.jp/api/graphql";
        let formData = {"query":"pages/novels/workId/episodes","data":{"workId":id,"first":30,"page":1}};
        let header = {"Content-Type": "application/json;charset=UTF-8", "x-from": "https://estar.jp/"};
        let options = {
            method: "POST",
            credentials: "include",
            body: JSON.stringify(formData),
            headers: header
        };
        let bookinfo = (await HttpClient.fetchJson(fetchUrl, options)).json;
        formData = {"query":"pages/novels/workId/episodes","data":{"workId":id,"first":bookinfo.data.novel.episodeCount,"page":1}};
        options = {
            method: "POST",
            credentials: "include",
            body: JSON.stringify(formData),
            headers: header
        };
        bookinfo = (await HttpClient.fetchJson(fetchUrl, options)).json;
        let nodes = bookinfo.data.novel.episodes.nodes;
        // an episode can span several viewer pages, up to where the next episode starts
        this.episodeEndPage = new Map();
        let chapters = nodes.map((a, i) => {
            let sourceUrl = "https://estar.jp/novels/"+bookinfo.data.novel.workId+"/viewer?page="+a.pageNo;
            this.episodeEndPage.set(sourceUrl, nodes[i + 1]?.pageNo ?? null);
            return { sourceUrl: sourceUrl, title: a.title };
        });
        return chapters;
    }

    findContent(dom) {
        return Parser.findConstrutedContent(dom);
    }

    extractTitleImpl(dom) {
        return dom.querySelector("div.info .title").textContent;
    }

    extractAuthor(dom) {
        return dom.querySelector("div.info .nickname").textContent;
    }

    extractSubject(dom) {
        let tags = [...dom.querySelectorAll(".tags a")];
        return tags.map(a => a.textContent).join(", ");
    }

    extractDescription(dom) {
        return dom.querySelector(".description").textContent.trim();
    }

    findCoverImageUrl(dom) {
        let pic = dom.querySelector(".novelData picture meta");
        return pic.content;
    }

    async fetchChapter(url) {
        let dom = (await HttpClient.wrapFetch(url)).responseXML;
        let newDoc = this.buildChapter(dom, url);
        let pageNo = parseInt(new URL(url).searchParams.get("page"));
        // last episode: no known end, stop when the site redirects past the last page
        let endPage = this.episodeEndPage?.get(url) ?? (pageNo + 500);
        for (let page = pageNo + 1; page < endPage; ++page) {
            let pageUrl = url.replace(/page=\d+/, "page=" + page);
            let xhr = await HttpClient.wrapFetch(pageUrl);
            if (new URL(xhr.response.url).searchParams.get("page") != page) {
                break;
            }
            this.appendPageContent(newDoc.dom, xhr.responseXML);
        }
        return newDoc.dom;
    }

    buildChapter(dom, url) {
        let newDoc = Parser.makeEmptyDocForContent(url);
        let title = newDoc.dom.createElement("h1");
        title.textContent = dom.querySelector("h1.subject")?.textContent ?? "";
        newDoc.content.appendChild(title);
        this.appendPageContent(newDoc.dom, dom);
        return newDoc;
    }

    appendPageContent(doc, dom) {
        let target = Parser.findConstrutedContent(doc);
        // section-title pages have no content; illustration pages contain only images
        let content = dom.querySelector(".mainBody .content");
        if (content === null) {
            return;
        }
        for (let img of content.querySelectorAll("img")) {
            let image = doc.createElement("img");
            image.src = img.src;
            image.alt = img.alt;
            target.appendChild(image);
        }
        let text = content.textContent;
        text = text.replace("\n\n", "\n");
        text = text.split("\n");
        let br = doc.createElement("br");
        for (let element of text) {
            let pnode = doc.createElement("p");
            pnode.textContent = element;
            target.appendChild(pnode);
            target.appendChild(br);
        }
    }
}
