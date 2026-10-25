/*
  Parses novels on marumaru (marumaru107.com, the number changes when the site moves)
*/
"use strict";

parserFactory.register("marumaru107.com", () => new MarumaruParser());
parserFactory.registerUrlRule(
    url => /^marumaru\d+\.[a-z]+$/.test(util.extractHostName(url)),
    () => new MarumaruParser()
);

class MarumaruParser extends Parser {
    constructor() {
        super();
        this.embedUrls = new Map();
    }

    // novel URL is /novel/<workId>, chapter URL is /novel/<workId>/<episodeId>
    static workId(url) {
        return new URL(url).pathname.match(/^\/novel\/(\d+)/)?.[1] ?? null;
    }

    async loadEpubMetaInfo(dom) {
        let origin = new URL(dom.baseURI).origin;
        let id = MarumaruParser.workId(dom.baseURI);
        let json = (await HttpClient.fetchJson(`${origin}/api/works/${id}`)).json;
        this.work = json.work;
        this.synopsis = json.synopsis;
        this.episodesUrl = json.episodesUrl;
    }

    async getChapterUrls(dom, chapterUrlsUI) {
        let origin = new URL(dom.baseURI).origin;
        let id = MarumaruParser.workId(dom.baseURI);
        if (this.episodesUrl == null) {
            await this.loadEpubMetaInfo(dom);
        }
        let toChapter = (e) => {
            let sourceUrl = `${origin}/novel/${id}/${e.id}`;
            if (e.embed_url) {
                this.embedUrls.set(sourceUrl, e.embed_url);
            }
            return {
                sourceUrl: sourceUrl,
                title: e.title ?? `${e.number}화`,
                isIncludeable: e.ready !== false
            };
        };
        let episodes = [];
        let size = 30;
        for (let page = 1; ; ++page) {
            // the API's "order" parameter is inverted (order=asc gives newest first), so sort below instead
            let json = (await HttpClient.fetchJson(`${this.episodesUrl}?page=${page}&size=${size}`)).json;
            let partial = json.episodes ?? [];
            episodes = episodes.concat(partial);
            chapterUrlsUI.showTocProgress(partial.map(toChapter));
            if ((partial.length < size) || (json.total <= episodes.length)) {
                break;
            }
            await this.rateLimitDelay();
        }
        return episodes
            .sort((a, b) => (Number(a.number) || 0) - (Number(b.number) || 0))
            .map(toChapter);
    }

    async fetchChapter(url) {
        let embedUrl = this.embedUrls.get(url);
        let body = null;
        if (!embedUrl) {
            let episodeId = new URL(url).pathname.split("/").pop();
            let episodeUrl = this.episodesUrl.replace(/\/works\/\d+$/, "/episodes/" + episodeId);
            let item = (await HttpClient.fetchJson(episodeUrl)).json.item;
            embedUrl = item?.embed_url;
            body = item?.body;
        }
        let text = embedUrl ? await HttpClient.fetchText(embedUrl) : "";
        return this.buildChapter(url, text, body);
    }

    // text is either plain lines or a JSON list of {kind, text} blocks
    buildChapter(url, text, body) {
        let newDoc = Parser.makeEmptyDocForContent(url);
        text = (text ?? "").replace(/^﻿/, "").trim();
        let blocks = Array.isArray(body) ? body : null;
        if (text.startsWith("[")) {
            try {
                blocks = JSON.parse(text);
            } catch (e) {
                blocks = null;
            }
        }
        let lines = blocks
            ? blocks.map(b => (typeof b === "string") ? b : (b?.text ?? "")).join("\n")
            : text;
        // lines can contain HTML entities such as &quot;
        let decoder = newDoc.dom.createElement("textarea");
        for (let line of lines.replace(/\r/g, "").split("\n")) {
            if (util.isNullOrEmpty(line.trim())) {
                continue;
            }
            decoder.innerHTML = line;
            let p = newDoc.dom.createElement("p");
            p.textContent = decoder.value;
            newDoc.content.appendChild(p);
        }
        return newDoc.dom;
    }

    findContent(dom) {
        return Parser.findConstrutedContent(dom);
    }

    extractTitleImpl() {
        return this.work?.title ?? "";
    }

    extractAuthor() {
        return this.work?.author ?? "";
    }

    extractSubject() {
        return this.work?.genres ?? "";
    }

    extractDescription() {
        return (this.synopsis ?? "").trim();
    }

    findCoverImageUrl() {
        return this.work?.coverUrl ?? null;
    }
}
