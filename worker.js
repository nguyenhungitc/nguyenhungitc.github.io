"use strict";

importScripts("engine.js");

self.onmessage = (e) => {
    const d = e.data || {};
    try {
        const pos = new Position();
        pos.fromFen(d.startFen || "rnbakabnr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/9/RNBAKABNR w");
        if (d.moves && d.moves.length) {
            for (let i = 0; i < d.moves.length; i++) {
                if (!pos.makeMove(d.moves[i])) break;
            }
        }
        const search = new Search(pos, d.hashLevel || 16);
        const mv = search.searchMain(d.depth, d.millis);
        self.postMessage({ gen: d.gen, move: mv, nodes: search.allNodes, ms: search.allMillis });
    } catch (err) {
        self.postMessage({ gen: d.gen, move: 0, error: String((err && err.message) || err) });
    }
};
