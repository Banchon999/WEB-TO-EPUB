"use strict";

// Chapter Range Input — พิมพ์เช่น "1-50, 80, 100-120"
(function () {

    function init() {
        const input   = document.getElementById("chapterRangeInput");
        const btnApply = document.getElementById("chapterRangeApply");
        const btnClear = document.getElementById("chapterRangeClear");
        const hint    = document.getElementById("chapterRangeHint");
        if (!input) return;

        // parse "1-50, 80, 100-120" → Set of 1-based indices
        function parseRanges(str) {
            const result = new Set();
            for (const part of str.split(",").map(s => s.trim()).filter(Boolean)) {
                const range = part.match(/^(\d+)\s*-\s*(\d+)$/);
                const single = part.match(/^(\d+)$/);
                if (range) {
                    const a = parseInt(range[1]), b = parseInt(range[2]);
                    for (let i = Math.min(a,b); i <= Math.max(a,b); i++) result.add(i);
                } else if (single) {
                    result.add(parseInt(single[1]));
                }
            }
            return result;
        }

        function setRow(row, checked) {
            const cb = row.querySelector("input[type='checkbox']");
            if (!cb || cb.checked === checked) return;
            cb.checked = checked;
            cb.onclick && cb.onclick();
        }

        function getRows() {
            return ChapterUrlsUI.getTableRowsWithChapters();
        }

        function syncCount() {
            const rows = getRows();
            const count = rows.filter(r => r.querySelector("input[type='checkbox']")?.checked).length;
            const el = document.getElementById("spanChapterCount");
            if (el) el.textContent = count;
        }

        function apply() {
            const selected = parseRanges(input.value);
            const rows = getRows();
            const total = rows.length;

            if (!selected.size) {
                hint.textContent = "⚠️ รูปแบบไม่ถูกต้อง";
                hint.style.color = "var(--danger, #e05252)";
                return;
            }

            rows.forEach((row, i) => {
                const idx = i + 1;
                const include = selected.has(idx);
                row.hidden = !include;
                setRow(row, include);
            });

            const outOfRange = [...selected].filter(n => n < 1 || n > total);
            const count = [...selected].filter(n => n >= 1 && n <= total).size;

            if (outOfRange.length) {
                hint.textContent = `✓ เลือก ${count} ตอน  |  ⚠️ ไม่มีตอน: ${outOfRange.join(", ")}`;
                hint.style.color = "var(--accent, #d4a853)";
            } else {
                hint.textContent = `✓ เลือก ${count} จาก ${total} ตอน`;
                hint.style.color = "var(--success, #52b788)";
            }
            syncCount();
        }

        function clear() {
            input.value = "";
            hint.textContent = "";
            getRows().forEach(row => {
                row.hidden = false;
                setRow(row, true);
            });
            syncCount();
        }

        btnApply.addEventListener("click", apply);
        btnClear.addEventListener("click", clear);
        input.addEventListener("keydown", e => { if (e.key === "Enter") apply(); });
    }

    // wait for ChapterUrlsUI to populate the table
    const observer = new MutationObserver(() => {
        if (ChapterUrlsUI.getTableRowsWithChapters().length > 0) {
            observer.disconnect();
        }
    });

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init);
    } else {
        init();
    }

})();
