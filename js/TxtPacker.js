/*
  Functions for packing chapters as TXT files inside a ZIP archive
*/
"use strict";

class TxtPacker {
    constructor(metaInfo) {
        this.metaInfo = metaInfo;
    }

    static addExtensionIfMissing(fileName) {
        // Strip .epub if present, then ensure .zip
        if (fileName.endsWith(".epub")) {
            fileName = fileName.slice(0, -5);
        }
        return fileName.endsWith(".zip") ? fileName : fileName + ".zip";
    }

    assemble(epubItemSupplier) {
        let zipFileWriter = new zip.BlobWriter("application/zip");
        let zipWriter = new zip.ZipWriter(zipFileWriter, {
            useWebWorkers: false,
            compressionMethod: 8,
            extendedTimestamp: false
        });

        let index = 0;
        for (let item of epubItemSupplier.spineItems()) {
            if (item.nodes != null) {
                let text = this.itemToText(item);
                let fileName = this.makeFileName(index, item.chapterTitle);
                zipWriter.add(fileName, new zip.TextReader(text));
                index++;
            }
        }

        return zipWriter.close();
    }

    makeFileName(index, title) {
        let paddedIndex = String(index + 1).padStart(4, "0");
        let safeName = title
            ? title.replace(/[<>:"/\\|?*\x00-\x1f]/g, "_").trim().substring(0, 80)
            : "chapter";
        if (!safeName) safeName = "chapter";
        return `${paddedIndex}_${safeName}.txt`;
    }

    itemToText(item) {
        let lines = [];

        if (item.chapterTitle) {
            lines.push(item.chapterTitle);
            lines.push("=".repeat(Math.min(item.chapterTitle.length, 60)));
            lines.push("");
        }

        for (let node of item.nodes) {
            this.nodeToLines(node, lines);
        }

        // Remove trailing blank lines
        while (lines.length && lines[lines.length - 1] === "") {
            lines.pop();
        }

        delete item.nodes;
        return lines.join("\n");
    }

    nodeToLines(node, lines) {
        if (node.nodeType === Node.TEXT_NODE) {
            let text = node.textContent.trim();
            if (text) {
                lines.push(text);
            }
            return;
        }

        if (node.nodeType !== Node.ELEMENT_NODE) {
            return;
        }

        let tagName = node.tagName.toLowerCase();

        if (["h1", "h2", "h3", "h4", "h5", "h6"].includes(tagName)) {
            if (lines.length && lines[lines.length - 1] !== "") {
                lines.push("");
            }
            lines.push(node.textContent.trim());
            lines.push("");
        } else if (tagName === "p") {
            let text = node.textContent.trim();
            if (text) {
                lines.push(text);
                lines.push("");
            }
        } else if (tagName === "br") {
            lines.push("");
        } else if (tagName === "hr") {
            lines.push("---");
            lines.push("");
        } else if (tagName === "li") {
            let text = node.textContent.trim();
            if (text) {
                lines.push("- " + text);
            }
        } else if (["script", "style", "img"].includes(tagName)) {
            // skip non-text nodes
        } else {
            // For div, section, article, span, ul, ol, blockquote, etc.
            // recurse into children
            for (let child of node.childNodes) {
                this.nodeToLines(child, lines);
            }
        }
    }
}
