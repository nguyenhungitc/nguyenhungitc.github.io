"use strict";

const RESULT_UNKNOWN = 0;
const RESULT_WIN = 1;
const RESULT_DRAW = 2;
const RESULT_LOSS = 3;
const BOARD_WIDTH = 521;
const BOARD_HEIGHT = 577;
const SQUARE_SIZE = 57;
const SQUARE_LEFT = (BOARD_WIDTH - SQUARE_SIZE * 9) >> 1;
const SQUARE_TOP = (BOARD_HEIGHT - SQUARE_SIZE * 10) >> 1;
const THINKING_SIZE = 32;
const THINKING_LEFT = (BOARD_WIDTH - THINKING_SIZE) >> 1;
const THINKING_TOP = (BOARD_HEIGHT - THINKING_SIZE) >> 1;
const MAX_STEP = 8;
const PIECE_NAME = [
    "oo",
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    "rk",
    "ra",
    "rb",
    "rn",
    "rr",
    "rc",
    "rp",
    null,
    "bk",
    "ba",
    "bb",
    "bn",
    "br",
    "bc",
    "bp",
    null,
];

const PUZZLE_LEVEL = { depth: 12, millis: 900 };

function SQ_X(sq) {
    return SQUARE_LEFT + (FILE_X(sq) - 3) * SQUARE_SIZE;
}

function SQ_Y(sq) {
    return SQUARE_TOP + (RANK_Y(sq) - 3) * SQUARE_SIZE;
}

function MOVE_PX(src, dst, step) {
    return `${Math.floor((src * step + dst * (MAX_STEP - step)) / MAX_STEP + 0.5)}px`;
}

function move2Iccs(mv) {
    const sqSrc = SRC(mv),
        sqDst = DST(mv);
    return `${String.fromCharCode(65 + FILE_X(sqSrc) - FILE_LEFT) + String.fromCharCode(57 - RANK_Y(sqSrc) + RANK_TOP)}-${String.fromCharCode(65 + FILE_X(sqDst) - FILE_LEFT)}${String.fromCharCode(57 - RANK_Y(sqDst) + RANK_TOP)}`;
}

function Board(container, images, sounds) {
    this.images = images;
    this.sounds = sounds || "sounds/";
    this.sound = false;
    this.pos = new Position();
    this.pos.fromFen("rnbakabnr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/9/RNBAKABNR w - - 0 1");
    this.animated = true;
    this.apiLevel = null;
    this.startFen = "rnbakabnr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/9/RNBAKABNR w - - 0 1";
    this.search = new Search(this.pos, 16);
    this.worker = null;
    this.pending = null;
    this.searchGen = 0;
    this.initWorker();
    this.imgSquares = [];
    this.sqSelected = 0;
    this.mvLast = 0;
    this.computer = 1;
    this.result = RESULT_UNKNOWN;
    this.busy = false;
    this.animGen = 0;
    this.container = container;
    let style = container.style;
    style.position = "relative";
    style.width = `${BOARD_WIDTH}px`;
    style.height = `${BOARD_HEIGHT}px`;
    style.background = `url(${images}board.svg)`;
    const this_ = this;
    for (let sq = 0; sq < 256; sq++) {
        if (!IN_BOARD(sq)) {
            this.imgSquares.push(null);
            continue;
        }
        const img = document.createElement("img");
        const imgStyle = img.style;
        imgStyle.position = "absolute";
        imgStyle.left = `${SQ_X(sq)}px`;
        imgStyle.top = `${SQ_Y(sq)}px`;
        imgStyle.width = `${SQUARE_SIZE}px`;
        imgStyle.height = `${SQUARE_SIZE}px`;
        imgStyle.zIndex = 0;
        img.onmousedown = ((sq_) => () => {
            this_.clickSquare(sq_);
        })(sq);
        container.appendChild(img);
        this.imgSquares.push(img);
    }
    this.thinking = document.createElement("img");
    this.thinking.src = `${images}thinking.gif`;
    style = this.thinking.style;
    style.visibility = "hidden";
    style.position = "absolute";
    style.left = `${THINKING_LEFT}px`;
    style.top = `${THINKING_TOP}px`;
    container.appendChild(this.thinking);
    this.flushBoard();
}

Board.prototype.playSound = function (soundFile) {
    if (!this.sound) return;
    try {
        new Audio(`${this.sounds + soundFile}.wav`).play();
    } catch (e) { }
};

Board.prototype.setSound = function (sound) {
    this.sound = sound;
    if (sound) this.playSound("click");
};

Board.prototype.flipped = function (sq) {
    return this.computer == 0 ? SQUARE_FLIP(sq) : sq;
};

Board.prototype.computerMove = function () {
    return this.pos.sdPlayer == this.computer;
};

Board.prototype.addMove = function (mv, computerMove) {
    if (!this.pos.legalMove(mv)) return;
    if (!this.pos.makeMove(mv)) {
        this.playSound("illegal");
        return;
    }
    this.busy = true;
    if (!this.animated) {
        this.postAddMove(mv, computerMove);
        return;
    }
    const sqSrc = this.flipped(SRC(mv));
    const xSrc = SQ_X(sqSrc);
    const ySrc = SQ_Y(sqSrc);
    const sqDst = this.flipped(DST(mv));
    const xDst = SQ_X(sqDst);
    const yDst = SQ_Y(sqDst);
    const style = this.imgSquares[sqSrc].style;
    style.zIndex = 256;
    let step = MAX_STEP - 1;
    const this_ = this;
    const ag = this.animGen;
    const timer = setInterval(() => {
        if (ag !== this_.animGen) {
            clearInterval(timer);
            return;
        }
        if (step == 0) {
            clearInterval(timer);
            style.left = `${xSrc}px`;
            style.top = `${ySrc}px`;
            style.zIndex = 0;
            this_.postAddMove(mv, computerMove);
        } else {
            style.left = MOVE_PX(xSrc, xDst, step);
            style.top = MOVE_PX(ySrc, yDst, step);
            step--;
        }
    }, 16);
};

Board.prototype.postAddMove = function (mv, computerMove) {
    if (this.mvLast > 0) {
        this.drawSquare(SRC(this.mvLast), false);
        this.drawSquare(DST(this.mvLast), false);
    }
    this.drawSquare(SRC(mv), "from");
    this.drawSquare(DST(mv), true);
    this.sqSelected = 0;
    this.mvLast = mv;
    if (this.pos.isMate()) {
        this.playSound(computerMove ? "loss" : "win");
        this.result = computerMove ? RESULT_LOSS : RESULT_WIN;
        const pc = SIDE_TAG(this.pos.sdPlayer) + PIECE_KING;
        let sqMate = 0;
        for (var sq = 0; sq < 256; sq++) {
            if (this.pos.squares[sq] == pc) {
                sqMate = sq;
                break;
            }
        }
        if (!this.animated || sqMate == 0) {
            this.postMate(computerMove);
            return;
        }
        sqMate = this.flipped(sqMate);
        const style = this.imgSquares[sqMate].style;
        style.zIndex = 256;
        const xMate = SQ_X(sqMate);
        let step = MAX_STEP;
        const this_ = this;
        const ag = this.animGen;
        const timer = setInterval(() => {
            if (ag !== this_.animGen) {
                clearInterval(timer);
                return;
            }
            if (step == 0) {
                clearInterval(timer);
                style.left = `${xMate}px`;
                style.zIndex = 0;
                this_.imgSquares[sqMate].src =
                    `${this_.images + (this_.pos.sdPlayer == 0 ? "r" : "b")}km.svg`;
                this_.postMate(computerMove);
            } else {
                style.left = `${xMate + ((step & 1) == 0 ? step : -step) * 2}px`;
                step--;
            }
        }, 50);
        return;
    }
    let vlRep = this.pos.repStatus(3);
    if (vlRep > 0) {
        vlRep = this.pos.repValue(vlRep);
        if (vlRep > -WIN_VALUE && vlRep < WIN_VALUE) {
            this.playSound("draw");
            this.result = RESULT_DRAW;
        } else if (computerMove == vlRep < 0) {
            this.playSound("loss");
            this.result = RESULT_LOSS;
        } else {
            this.playSound("win");
            this.result = RESULT_WIN;
        }
        this.postAddMove2(mv, computerMove);
        this.busy = false;
        return;
    }
    if (this.pos.captured()) {
        let hasMaterial = false;
        for (var sq = 0; sq < 256; sq++) {
            if (IN_BOARD(sq) && (this.pos.squares[sq] & 7) > 2) {
                hasMaterial = true;
                break;
            }
        }
        if (!hasMaterial) {
            this.playSound("draw");
            this.result = RESULT_DRAW;
            this.postAddMove2(mv, computerMove);
            this.busy = false;
            return;
        }
    } else if (this.pos.pcList.length > 100) {
        let captured = false;
        for (let i = 2; i <= 100; i++) {
            if (this.pos.pcList[this.pos.pcList.length - i] > 0) {
                captured = true;
                break;
            }
        }
        if (!captured) {
            this.playSound("draw");
            this.result = RESULT_DRAW;
            this.postAddMove2(mv, computerMove);
            this.busy = false;
            return;
        }
    }
    if (this.pos.inCheck()) {
        this.playSound(computerMove ? "check2" : "check");
    } else if (this.pos.captured()) {
        this.playSound(computerMove ? "capture2" : "capture");
    } else {
        this.playSound(computerMove ? "move2" : "move");
    }
    this.postAddMove2(mv, computerMove);
    this.response();
};

Board.prototype.postAddMove2 = function (mv, computerMove) {
    if (typeof this.onAddMove == "function") {
        this.onAddMove(mv, computerMove);
    }
};

Board.prototype.postMate = function (computerMove) {
    this.postAddMove2(this.mvLast, computerMove);
    this.busy = false;
};

Board.prototype.initWorker = function () {
    if (typeof Worker === "undefined") return;
    const this_ = this;
    try {
        const w = new Worker("worker.js");
        w.onmessage = (e) => {
            const data = e.data || {};
            if (data.type === "ready") return;
            const p = this_.pending;
            if (p && data.gen === p.gen) {
                this_.pending = null;
                p.cb(data.move);
            }
        };
        w.onerror = (ev) => {
            this_.worker = null;
            const p = this_.pending;
            if (p) {
                this_.pending = null;
                this_.computeSync(p.cfg, p.cb);
            }
        };
        this.worker = w;
    } catch (e) {
        this.worker = null;
    }
};

Board.prototype.computeMove = function (cfg, cb) {
    const gen = ++this.searchGen;
    if (this.worker) {
        this.pending = { gen, cb, cfg };
        try {
            this.worker.postMessage({
                gen,
                startFen: this.startFen,
                moves: this.pos.mvList.slice(1),
                depth: cfg.depth,
                millis: cfg.millis,
                hashLevel: 16,
            });
            return;
        } catch (e) {
            this.pending = null;
            this.worker = null;
        }
    }
    this.computeSync(cfg, cb);
};

Board.prototype.computeSync = function (cfg, cb) {
    const this_ = this;
    const gen = this.searchGen;
    setTimeout(() => {
        if (gen !== this_.searchGen) return;
        let mv = 0;
        try {
            mv = this_.search.searchMain(cfg.depth, cfg.millis);
        } catch (err) { }
        cb(mv);
    }, 0);
};

Board.prototype.response = function () {
    if (this.apiLevel == null || !this.computerMove()) {
        this.busy = false;
        return;
    }
    this.thinking.style.visibility = "visible";
    this.busy = true;
    const this_ = this;
    this.computeMove(PUZZLE_LEVEL, (mv) => {
        this_.thinking.style.visibility = "hidden";
        if (!mv || !this_.pos.legalMove(mv)) {
            this_.busy = false;
            return;
        }
        this_.addMove(mv, true);
    });
};

Board.prototype.clickSquare = function (sq_) {
    if (this.busy || this.result != RESULT_UNKNOWN) return;
    const sq = this.flipped(sq_);
    const pc = this.pos.squares[sq];
    if ((pc & SIDE_TAG(this.pos.sdPlayer)) != 0) {
        this.playSound("click");
        if (this.mvLast != 0) {
            this.drawSquare(SRC(this.mvLast), false);
            this.drawSquare(DST(this.mvLast), false);
        }
        if (this.sqSelected) {
            this.drawSquare(this.sqSelected, false);
        }
        this.drawSquare(sq, true);
        this.sqSelected = sq;
    } else if (this.sqSelected > 0) {
        this.addMove(MOVE(this.sqSelected, sq), false);
    }
};

Board.prototype.drawSquare = function (sq, selected) {
    const img = this.imgSquares[this.flipped(sq)];
    img.src = `${this.images + PIECE_NAME[this.pos.squares[sq]]}.svg`;
    const marker = selected === "from" ? "oos-from.svg" : selected ? "oos.svg" : "";
    img.style.backgroundImage = marker ? `url(${this.images}${marker})` : "";
};

Board.prototype.flushBoard = function () {
    this.mvLast = this.pos.mvList[this.pos.mvList.length - 1];
    for (let sq = 0; sq < 256; sq++) {
        if (IN_BOARD(sq)) {
            this.drawSquare(sq, sq == SRC(this.mvLast) ? "from" : sq == DST(this.mvLast));
        }
    }
    if (typeof window.renderCapturedTray === "function") window.renderCapturedTray();
};

Board.prototype.restart = function (fen) {
    this.animGen++;
    this.result = RESULT_UNKNOWN;
    this.startFen = fen;
    this.pos.fromFen(fen);
    this.flushBoard();
    this.playSound("newgame");
    this.response();
};

((global) => {
    const STORAGE_KEY = "chessone.xiangqi.userstats.v1";
    const LEVEL_ELO = {
        1: 800,
        2: 1000,
        3: 1200,
        4: 1400,
        5: 1600,
        6: 1800,
        7: 2000,
        8: 2200,
        9: 2400,
        10: 2600,
    };
    const DEFAULT_STATS = {
        elo: 1200,
        totalGames: 0,
        wins: 0,
        losses: 0,
        draws: 0,
        bestElo: 1200,
        updatedAt: 0,
    };
    const K_FACTOR = 32;
    const ELO_MIN = 100;
    const listeners = [];
    function load() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (!raw) return Object.assign({}, DEFAULT_STATS);
            return Object.assign({}, DEFAULT_STATS, JSON.parse(raw));
        } catch (e) {
            return Object.assign({}, DEFAULT_STATS);
        }
    }
    function save(stats) {
        try {
            stats.updatedAt = Date.now();
            localStorage.setItem(STORAGE_KEY, JSON.stringify(stats));
            return true;
        } catch (e) {
            return false;
        }
    }
    function notify() {
        const stats = load();
        for (let i = 0; i < listeners.length; i++) {
            try {
                listeners[i](stats);
            } catch (e) { }
        }
    }
    function computeNewElo(playerElo, opponentElo, score) {
        const expected = 1 / (1 + Math.pow(10, (opponentElo - playerElo) / 400));
        let newElo = Math.round(playerElo + K_FACTOR * (score - expected));
        if (newElo < ELO_MIN) newElo = ELO_MIN;
        return newElo;
    }
    function addGameResult(level, result) {
        if (result !== "win" && result !== "loss" && result !== "draw") return null;
        const opponentElo = LEVEL_ELO[level] || 1600;
        const stats = load();
        const oldElo = stats.elo;
        const score = result === "win" ? 1 : result === "draw" ? 0.5 : 0;
        const newElo = computeNewElo(oldElo, opponentElo, score);
        stats.elo = newElo;
        stats.totalGames += 1;
        if (result === "win") stats.wins += 1;
        if (result === "loss") stats.losses += 1;
        if (result === "draw") stats.draws += 1;
        if (newElo > stats.bestElo) stats.bestElo = newElo;
        save(stats);
        notify();
        return { oldElo, newElo, delta: newElo - oldElo };
    }
    function onChange(fn) {
        if (typeof fn === "function") listeners.push(fn);
    }
    global.ChessOneStats = { get: load, addGameResult, onChange };
})(this);

((global) => {
    const STORAGE_KEY = "chessone.xiangqi.history.v1";
    const GAME_KEY = "xiangqi";
    const GAME_LABEL = "xiangqi";
    const MAX_GAMES = 20;
    const SHARE_VERSION = 1;
    function loadAll() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            return raw ? JSON.parse(raw) : [];
        } catch (e) {
            return [];
        }
    }
    function saveAll(games) {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(games));
            return true;
        } catch (e) {
            return false;
        }
    }
    function save(game) {
        if (!game || !game.id) return false;
        let games = loadAll();
        const idx = games.findIndex((g) => g.id === game.id);
        if (idx >= 0) games[idx] = game;
        else games.unshift(game);
        if (games.length > MAX_GAMES) games = games.slice(0, MAX_GAMES);
        return saveAll(games);
    }
    function list() {
        return loadAll();
    }
    function get(id) {
        return loadAll().find((g) => g.id === id) || null;
    }
    function deleteGame(id) {
        return saveAll(loadAll().filter((g) => g.id !== id));
    }
    function clear() {
        try {
            localStorage.removeItem(STORAGE_KEY);
            return true;
        } catch (e) {
            return false;
        }
    }
    function buildSharePayloadGame(game) {
        const copy = {};
        for (const k in game) {
            if (!game.hasOwnProperty(k)) continue;
            if (k.charAt(0) === "_") continue;
            if (k === "id") continue;
            copy[k] = game[k];
        }
        return copy;
    }
    function b64urlEncode(str) {
        return btoa(unescape(encodeURIComponent(str)))
            .replace(/\+/g, "-")
            .replace(/\//g, "_")
            .replace(/=+$/, "");
    }
    function b64urlDecode(str) {
        let b64 = String(str).replace(/-/g, "+").replace(/_/g, "/");
        while (b64.length % 4) b64 += "=";
        return decodeURIComponent(escape(atob(b64)));
    }
    function encodeGame(game) {
        return b64urlEncode(
            JSON.stringify({ v: SHARE_VERSION, k: GAME_KEY, g: buildSharePayloadGame(game) }),
        );
    }
    function decodeGame(token) {
        try {
            const payload = JSON.parse(b64urlDecode(token));
            if (!payload || payload.k !== GAME_KEY || !payload.g) return null;
            if (!Array.isArray(payload.g.moves)) return null;
            return payload.g;
        } catch (e) {
            return null;
        }
    }
    function buildShareUrl(game) {
        return `${location.origin + location.pathname + location.search}#g=${encodeGame(game)}`;
    }
    function parseShareFromUrl() {
        const m = (location.hash || "").match(/[#&]g=([^&]+)/);
        return m ? decodeGame(m[1]) : null;
    }
    function clearShareFromUrl() {
        try {
            history.replaceState(null, "", location.origin + location.pathname + location.search);
        } catch (e) {
            try {
                location.hash = "";
            } catch (e2) { }
        }
    }
    function importShared(game) {
        if (!game) return null;
        let g;
        try {
            g = JSON.parse(JSON.stringify(game));
        } catch (e) {
            return null;
        }
        const fingerprint = `${JSON.stringify(g.moves || [])}|${g.result || ""}|${g.startedAt || ""}`;
        const existing = loadAll();
        for (let i = 0; i < existing.length; i++) {
            const efp = `${JSON.stringify(existing[i].moves || [])}|${existing[i].result || ""}|${existing[i].startedAt || ""}`;
            if (efp === fingerprint) return existing[i];
        }
        g.id = `${String(Date.now())}_s${Math.floor(Math.random() * 1000)}`;
        g.imported = true;
        if (!g.result) g.result = "abandoned";
        save(g);
        return g;
    }
    function injectStylesOnce() {
        if (document.getElementById("co-share-style")) return;
        const st = document.createElement("style");
        st.id = "co-share-style";
        st.textContent =
            ".co-share-overlay{position:fixed;inset:0;background:rgba(20,12,4,.55);display:flex;align-items:center;justify-content:center;z-index:9999;}" +
            ".co-share-card{background:var(--bg-card,#fffaf0);color:var(--text,#2d1810);width:min(460px,92vw);border-radius:16px;padding:22px;box-shadow:0 18px 50px rgba(0,0,0,.35);font-family:inherit;}" +
            ".co-share-card h3{margin:0 0 4px;font-size:18px;}" +
            ".co-share-card p{margin:0 0 14px;font-size:13px;color:var(--text-muted,#6b5644);line-height:1.5;}" +
            ".co-share-row{display:flex;gap:8px;}" +
            ".co-share-input{flex:1;min-width:0;padding:10px 12px;border-radius:10px;font-size:13px;border:1px solid rgba(0,0,0,.18);background:var(--bg,#f4e4c1);color:var(--text,#2d1810);font-family:ui-monospace,Menlo,Consolas,monospace;}" +
            ".co-share-btn{border:none;cursor:pointer;border-radius:10px;padding:10px 16px;font-size:14px;font-weight:600;white-space:nowrap;}" +
            ".co-share-btn.primary{background:#b5371f;color:#fff;}" +
            ".co-share-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:16px;}" +
            ".co-share-btn.ghost{background:transparent;color:var(--text-muted,#6b5644);}" +
            ".co-share-hint{font-size:12px;color:var(--text-muted,#6b5644);margin-top:10px;}" +
            ".co-toast{position:fixed;left:50%;bottom:26px;transform:translateX(-50%);background:#2d1810;color:#fff;padding:11px 18px;border-radius:999px;font-size:14px;box-shadow:0 8px 24px rgba(0,0,0,.3);z-index:10000;max-width:88vw;text-align:center;}";
        document.head.appendChild(st);
    }
    function showToast(msg, ms) {
        injectStylesOnce();
        const t = document.createElement("div");
        t.className = "co-toast";
        t.textContent = msg;
        document.body.appendChild(t);
        setTimeout(() => {
            t.style.transition = "opacity .3s";
            t.style.opacity = "0";
            setTimeout(() => {
                if (t.parentNode) t.parentNode.removeChild(t);
            }, 320);
        }, ms || 2600);
    }
    function showShareDialog(game) {
        if (!game || !game.moves || !game.moves.length) {
            alert("Play a few moves first, then share.");
            return;
        }
        injectStylesOnce();
        const url = buildShareUrl(game);
        const overlay = document.createElement("div");
        overlay.className = "co-share-overlay";
        const nMoves = game.moveCount || game.moves.length;
        const card = document.createElement("div");
        card.className = "co-share-card";
        const h = document.createElement("h3");
        h.textContent = `Share ${GAME_LABEL} game`;
        const p = document.createElement("p");
        p.textContent = `Send this link. When opened, the game (${nMoves} moves) is saved on their device and replayed.`;
        const row = document.createElement("div");
        row.className = "co-share-row";
        const input = document.createElement("input");
        input.className = "co-share-input";
        input.type = "text";
        input.readOnly = true;
        input.value = url;
        const copyBtn = document.createElement("button");
        copyBtn.className = "co-share-btn primary";
        copyBtn.textContent = "Copy";
        row.appendChild(input);
        row.appendChild(copyBtn);
        const hint = document.createElement("div");
        hint.className = "co-share-hint";
        const actions = document.createElement("div");
        actions.className = "co-share-actions";
        const closeBtn = document.createElement("button");
        closeBtn.className = "co-share-btn ghost";
        closeBtn.textContent = "Close";
        actions.appendChild(closeBtn);
        card.appendChild(h);
        card.appendChild(p);
        card.appendChild(row);
        card.appendChild(hint);
        card.appendChild(actions);
        overlay.appendChild(card);
        document.body.appendChild(overlay);
        function close() {
            if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
        }
        overlay.addEventListener("click", (e) => {
            if (e.target === overlay) close();
        });
        closeBtn.addEventListener("click", close);
        function selectAll() {
            input.focus();
            input.select();
            input.setSelectionRange(0, input.value.length);
        }
        copyBtn.addEventListener("click", () => {
            const done = () => {
                copyBtn.textContent = "Copied";
                setTimeout(() => {
                    copyBtn.textContent = "Copy";
                }, 1800);
            };
            if (navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText(url).then(done, () => {
                    selectAll();
                    try {
                        document.execCommand("copy");
                        done();
                    } catch (e) {
                        hint.textContent = "Press Ctrl/Cmd + C to copy.";
                    }
                });
            } else {
                selectAll();
                try {
                    document.execCommand("copy");
                    done();
                } catch (e) {
                    hint.textContent = "Press Ctrl/Cmd + C to copy.";
                }
            }
        });
        setTimeout(selectAll, 30);
    }
    function bootSharedGame(onReplay) {
        const shared = parseShareFromUrl();
        if (!shared) return null;
        const g = importShared(shared);
        clearShareFromUrl();
        if (g && typeof onReplay === "function") {
            try {
                onReplay(g);
            } catch (e) { }
        }
        if (g) showToast("Received a shared game - replaying");
        return g;
    }
    global.ChessOneHistory = {
        save,
        list,
        get,
        delete: deleteGame,
        clear,
        showShareDialog,
        bootSharedGame,
    };
})(this);

(() => {
    const K = "Cf9$kR2!pZ7mWq3@Lx5&Tn1#";
    const D =
        "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";
    let cache = null;
    function decode() {
        if (cache) return cache;
        const bin = atob(D),
            n = bin.length,
            bytes = new Uint8Array(n);
        for (let i = 0; i < n; i++) bytes[i] = bin.charCodeAt(i) ^ K.charCodeAt(i % K.length);
        cache = JSON.parse(new TextDecoder("utf-8").decode(bytes));
        return cache;
    }
    window.ChessOnePuzzles = {
        all() {
            return decode();
        },
        count() {
            return decode().length;
        },
        get(i) {
            return decode()[i];
        },
        fen(i) {
            return decode()[i];
        },
        random() {
            const a = decode();
            return Math.floor(Math.random() * a.length);
        },
    };
})();

(() => {
    const RED = "#c0392b";
    const BLACK = "#2b2b2b";
    const GLYPH = {
        K: "帥",
        A: "仕",
        E: "相",
        B: "相",
        H: "馬",
        N: "馬",
        R: "車",
        C: "砲",
        P: "兵",
        k: "將",
        a: "士",
        e: "象",
        b: "象",
        h: "馬",
        n: "馬",
        r: "車",
        c: "炮",
        p: "卒",
    };

    const board = new Board(document.getElementById("container"), "images/", "sounds/");

    window.renderCapturedTray = () => {
        const el = document.getElementById("capturedTray");
        if (!el) return;
        const pos = board.pos;
        let html = "";
        for (let i = 1; i < pos.pcList.length; i++) {
            const pc = pos.pcList[i];
            if (!pc) continue;
            const name = PIECE_NAME[pc];
            if (!name) continue;
            html += `<img src="images/${name}.svg" alt="" class="cap-pc">`;
        }
        el.innerHTML = html;
    };

    let moveSeq = [];
    let resultShown = false;
    let currentIdx = -1;
    let humanSide = 0;
    let currentGame = null;
    let reviewMode = false;
    let reviewMoves = [];
    let reviewPly = 0;
    const PUZZLE_ELO_LEVEL = 6;

    const homeView = document.getElementById("homeView");
    const playView = document.getElementById("playView");
    const grid = document.getElementById("puzzleGrid");
    const btnMore = document.getElementById("btnLoadMore");
    const nameEl = document.getElementById("puzzleName");
    const turnDot = document.getElementById("turnDot");
    const turnText = document.getElementById("turnText");
    const moveListEl = document.getElementById("moveList");
    const toastEl = document.getElementById("resultToast");
    const playRed = document.getElementById("playRed");
    const playBlack = document.getElementById("playBlack");
    const boardWrapper = document.querySelector(".board-wrapper");
    const statElo = document.getElementById("statElo");
    const statGames = document.getElementById("statGames");
    const historyCard = document.getElementById("historyCard");
    const historyList = document.getElementById("historyList");
    const reviewNote = document.getElementById("reviewNote");
    const reviewNav = document.getElementById("reviewNav");
    const navFirst = document.getElementById("navFirst");
    const navPrev = document.getElementById("navPrev");
    const navNext = document.getElementById("navNext");
    const navLast = document.getElementById("navLast");
    const sideChooser = document.getElementById("sideChooser");
    const puzzleBtns = document.getElementById("puzzleBtns");
    const btnReplay = document.getElementById("btnReplay");
    const btnNext = document.getElementById("btnNext");

    const RESULT_META = {
        win: { label: "Win", color: "#2e7d32" },
        loss: { label: "Loss", color: "#c62828" },
        draw: { label: "Draw", color: "#757575" },
        abandoned: { label: "Unfinished", color: "#bf8e3a" },
    };

    function parseFen(fen) {
        const parts = fen.trim().split(/\s+/);
        const rows = parts[0].split("/");
        const grid = [];
        for (let r = 0; r < 10; r++) {
            const row = rows[r] || "";
            const cells = [];
            for (let c = 0; c < row.length; c++) {
                const ch = row[c];
                if (ch >= "0" && ch <= "9") {
                    const n = +ch;
                    for (let k = 0; k < n; k++) cells.push(null);
                } else {
                    cells.push(ch);
                }
            }
            while (cells.length < 9) cells.push(null);
            grid.push(cells.slice(0, 9));
        }
        const token = parts[1] || "w";
        return { grid, turn: token === "b" ? 1 : 0 };
    }

    function miniSVG(fen) {
        const pad = 12,
            step = 20;
        const w = pad * 2 + step * 8;
        const h = pad * 2 + step * 9;
        const data = parseFen(fen);
        const g = data.grid;
        const gid = `mb${Math.random().toString(36).substr(2, 6)}`;
        let s = `<svg viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg">`;
        s += `<defs><linearGradient id="${gid}" x1="0" y1="0" x2="1" y2="1">`;
        s +=
            '<stop offset="0" stop-color="#e8c787"/><stop offset="1" stop-color="#d6a85f"/></linearGradient></defs>';
        s += `<rect x="0" y="0" width="${w}" height="${h}" rx="4" fill="url(#${gid})"/>`;
        const x0 = pad,
            y0 = pad,
            x8 = pad + step * 8,
            y9 = pad + step * 9;
        const y4 = pad + step * 4,
            y5 = pad + step * 5;
        const fo = 5;
        s += `<rect x="${x0 - fo}" y="${y0 - fo}" width="${x8 - x0 + 2 * fo}" height="${y9 - y0 + 2 * fo}" fill="none" stroke="#5d2e0c" stroke-width="2"/>`;
        s += '<g stroke="#5d3a1c" stroke-width="1" fill="none">';
        for (let r = 0; r < 10; r++) {
            const y = pad + step * r;
            s += `<line x1="${x0}" y1="${y}" x2="${x8}" y2="${y}"/>`;
        }
        for (let c = 0; c < 9; c++) {
            const x = pad + step * c;
            if (c === 0 || c === 8) {
                s += `<line x1="${x}" y1="${y0}" x2="${x}" y2="${y9}"/>`;
            } else {
                s += `<line x1="${x}" y1="${y0}" x2="${x}" y2="${y4}"/>`;
                s += `<line x1="${x}" y1="${y5}" x2="${x}" y2="${y9}"/>`;
            }
        }
        const px3 = pad + step * 3,
            px5 = pad + step * 5;
        const py0 = pad,
            py2 = pad + step * 2,
            py7 = pad + step * 7,
            py9 = pad + step * 9;
        s += `<line x1="${px3}" y1="${py0}" x2="${px5}" y2="${py2}"/>`;
        s += `<line x1="${px5}" y1="${py0}" x2="${px3}" y2="${py2}"/>`;
        s += `<line x1="${px3}" y1="${py7}" x2="${px5}" y2="${py9}"/>`;
        s += `<line x1="${px5}" y1="${py7}" x2="${px3}" y2="${py9}"/>`;
        s += "</g>";
        for (let rr = 0; rr < 10; rr++) {
            for (let cc = 0; cc < 9; cc++) {
                const pc = g[rr][cc];
                if (!pc) continue;
                const glyph = GLYPH[pc];
                if (!glyph) continue;
                const color = pc === pc.toUpperCase() ? RED : BLACK;
                const cx = pad + step * cc,
                    cy = pad + step * rr;
                s += `<circle cx="${cx}" cy="${cy}" r="8.5" fill="#f8eecb" stroke="${color}" stroke-width="1.2"/>`;
                s += `<text x="${cx}" y="${cy}" font-size="12" text-anchor="middle" dominant-baseline="central" fill="${color}" font-family="serif">${glyph}</text>`;
            }
        }
        s += "</svg>";
        return s;
    }

    let shown = {};

    function remainingIndices() {
        const total = ChessOnePuzzles.count();
        const out = [];
        for (let i = 0; i < total; i++) if (!shown[i]) out.push(i);
        return out;
    }

    function shuffle(arr) {
        for (let i = arr.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            const t = arr[i];
            arr[i] = arr[j];
            arr[j] = t;
        }
        return arr;
    }

    function addCells(n) {
        const rem = shuffle(remainingIndices());
        const count = Math.min(n, rem.length);
        for (let i = 0; i < count; i++) {
            const idx = rem[i];
            shown[idx] = true;
            const cell = document.createElement("div");
            cell.className = "puzzle-cell";
            cell.innerHTML = `<div class="mini-board">${miniSVG(ChessOnePuzzles.fen(idx))}</div>`;
            cell.onclick = ((id) => () => {
                openPuzzle(id);
            })(idx);
            grid.appendChild(cell);
        }
        if (remainingIndices().length === 0) {
            btnMore.disabled = true;
            btnMore.textContent = "No more puzzles";
        }
    }

    function buildHome() {
        grid.innerHTML = "";
        shown = {};
        btnMore.disabled = false;
        btnMore.textContent = "Load more";
        addCells(9);
    }

    function stopThinking() {
        board.searchGen++;
        board.animGen++;
        board.pending = null;
        board.busy = false;
        board.thinking.style.visibility = "hidden";
    }

    function updateTurn() {
        const red = board.pos.sdPlayer === 0;
        turnDot.className = `turn-dot ${red ? "red" : "black"}`;
        turnText.textContent = `${red ? "Red" : "Black"} to move`;
    }

    function renderMoves() {
        if (moveSeq.length === 0) {
            moveListEl.innerHTML = '<span class="move-empty">No moves yet.</span>';
            return;
        }
        let html = "";
        for (let i = 0; i < moveSeq.length; i++) {
            const label = move2Iccs(moveSeq[i]);
            const head = i % 2 === 0 ? `<span class="num">${i / 2 + 1}.</span>` : "";
            html += `<span class="move" data-ply="${i + 1}"${reviewMode ? ' style="cursor:pointer"' : ""}>${head}${label}</span>`;
        }
        moveListEl.innerHTML = html;
        if (reviewMode) {
            const spans = moveListEl.querySelectorAll(".move");
            for (let k = 0; k < spans.length; k++) {
                spans[k].addEventListener("click", function () {
                    gotoPly(parseInt(this.getAttribute("data-ply"), 10));
                });
            }
        }
        moveListEl.scrollTop = moveListEl.scrollHeight;
    }

    function showResult(result, delta) {
        let cls = "win",
            msg = "You win!";
        if (result === RESULT_LOSS) {
            cls = "loss";
            msg = "You lose.";
        } else if (result === RESULT_DRAW) {
            cls = "draw";
            msg = "Draw.";
        }
        if (delta && delta.delta) msg += ` ${delta.delta > 0 ? "+" : ""}${delta.delta} rating`;
        toastEl.className = `result-toast ${cls}`;
        toastEl.textContent = msg;
        void toastEl.offsetWidth;
        toastEl.classList.add("show");
        setTimeout(() => {
            toastEl.classList.remove("show");
        }, 4000);
    }

    board.onAddMove = (mv, computerMove) => {
        if (typeof window.renderCapturedTray === "function") window.renderCapturedTray();
        if (reviewMode) return;
        moveSeq.push(mv);
        renderMoves();
        updateTurn();
        if (!currentGame) return;
        currentGame.moves.push(mv);
        currentGame.moveCount = currentGame.moves.length;
        currentGame.finalFen = board.pos.toFen();
        if (board.result !== RESULT_UNKNOWN && !currentGame._done) {
            currentGame._done = true;
            currentGame.finishedAt = Date.now();
            currentGame.result =
                board.result === RESULT_WIN
                    ? "win"
                    : board.result === RESULT_LOSS
                        ? "loss"
                        : "draw";
            const delta = ChessOneStats.addGameResult(PUZZLE_ELO_LEVEL, currentGame.result);
            ChessOneHistory.save(currentGame);
            renderHistory();
            if (!resultShown) {
                resultShown = true;
                showResult(board.result, delta);
            }
        }
    };

    function rescaleBoard() {
        if (!boardWrapper) return;
        const w = boardWrapper.clientWidth;
        if (!w) return;
        const scale = Math.min(w / BOARD_WIDTH, 1);
        board.container.style.transform = `scale(${scale})`;
        boardWrapper.style.height = `${BOARD_HEIGHT * scale}px`;
    }

    function newGame(idx, fen, side) {
        return {
            id: `${String(Date.now())}_${Math.floor(Math.random() * 10000)}`,
            startedAt: Date.now(),
            finishedAt: null,
            puzzleIdx: idx,
            startFen: fen,
            userSide: side === 0 ? "red" : "black",
            result: "abandoned",
            moveCount: 0,
            moves: [],
            finalFen: null,
        };
    }

    function renderStats(s) {
        s = s || ChessOneStats.get();
        statElo.textContent = s.elo;
        if (s.totalGames > 0) {
            statGames.innerHTML = `${s.totalGames} <span style="font-size:12px;opacity:.75">(${s.wins}/${s.draws}/${s.losses})</span>`;
        } else {
            statGames.textContent = "0";
        }
    }

    function formatDate(ts) {
        if (!ts) return "";
        const d = new Date(ts);
        const p = (n) => (n < 10 ? `0${n}` : n);
        return `${p(d.getDate())}/${p(d.getMonth() + 1)} ${p(d.getHours())}:${p(d.getMinutes())}`;
    }

    function renderHistory() {
        const games = ChessOneHistory.list();
        if (!games.length) {
            historyCard.style.display = "none";
            historyList.innerHTML = "";
            return;
        }
        historyCard.style.display = "";
        let html = "";
        for (let i = 0; i < games.length; i++) {
            const g = games[i];
            const meta = RESULT_META[g.result] || RESULT_META.abandoned;
            const idxLabel =
                typeof g.puzzleIdx === "number" ? `#${g.puzzleIdx + 1}` : "Shared game";
            const thumbFen = g.finalFen || g.startFen || "";
            html += `<div class="history-item" data-id="${g.id}">`;
            html += `<div class="history-thumb">${thumbFen ? miniSVG(thumbFen) : ""}</div>`;
            html += '<div class="history-meta">';
            html += `<div class="history-row1"><span class="history-result" style="background:${meta.color}">${meta.label}</span><span class="history-name">${idxLabel}</span></div>`;
            html += `<div class="history-sub">${g.moveCount || 0} moves &middot; ${formatDate(g.startedAt)}</div>`;
            html += "</div>";
            html += `<div class="history-actions"><button class="history-btn" data-share="${g.id}" title="Share">&#128279;</button><button class="history-btn" data-del="${g.id}" title="Delete">&#128465;</button></div>`;
            html += "</div>";
        }
        historyList.innerHTML = html;
        const items = historyList.querySelectorAll(".history-item");
        for (let k = 0; k < items.length; k++) {
            items[k].addEventListener("click", function (e) {
                if (e.target.getAttribute("data-share") || e.target.getAttribute("data-del"))
                    return;
                const g = ChessOneHistory.get(this.getAttribute("data-id"));
                if (g) reviewGame(g);
            });
        }
        const shareBtns = historyList.querySelectorAll("[data-share]");
        for (let s = 0; s < shareBtns.length; s++) {
            shareBtns[s].addEventListener("click", function (e) {
                e.stopPropagation();
                ChessOneHistory.showShareDialog(
                    ChessOneHistory.get(this.getAttribute("data-share")),
                );
            });
        }
        const delBtns = historyList.querySelectorAll("[data-del]");
        for (let d = 0; d < delBtns.length; d++) {
            delBtns[d].addEventListener("click", function (e) {
                e.stopPropagation();
                if (confirm("Delete this game?")) {
                    ChessOneHistory.delete(this.getAttribute("data-del"));
                    renderHistory();
                }
            });
        }
    }

    function updateReviewUI(on) {
        sideChooser.style.display = on ? "none" : "";
        puzzleBtns.style.display = on ? "none" : "";
        reviewNote.style.display = on ? "" : "none";
        reviewNav.style.display = on ? "" : "none";
        if (on) {
            reviewNote.innerHTML =
                '<span>Reviewing saved game</span><button id="btnExitReview">Exit</button>';
            const ex = document.getElementById("btnExitReview");
            if (ex) ex.addEventListener("click", showHome);
        }
    }

    function highlightPly(n) {
        const spans = moveListEl.querySelectorAll(".move");
        for (let i = 0; i < spans.length; i++) {
            if (i === n - 1) spans[i].classList.add("active");
            else spans[i].classList.remove("active");
        }
        if (n > 0 && spans[n - 1]) {
            const el = spans[n - 1];
            const elRect = el.getBoundingClientRect();
            const contRect = moveListEl.getBoundingClientRect();
            if (elRect.top < contRect.top) {
                moveListEl.scrollTop -= contRect.top - elRect.top;
            } else if (elRect.bottom > contRect.bottom) {
                moveListEl.scrollTop += elRect.bottom - contRect.bottom;
            }
        }
    }

    function updateNav() {
        navFirst.disabled = navPrev.disabled = reviewPly <= 0;
        navLast.disabled = navNext.disabled = reviewPly >= reviewMoves.length;
    }

    function gotoPly(n) {
        if (n < 0) n = 0;
        if (n > reviewMoves.length) n = reviewMoves.length;
        reviewPly = n;
        board.pos.fromFen(board.startFen);
        board.mvLast = 0;
        for (let i = 0; i < n; i++) {
            if (!board.pos.legalMove(reviewMoves[i])) break;
            board.pos.makeMove(reviewMoves[i]);
            board.mvLast = reviewMoves[i];
        }
        board.flushBoard();
        updateTurn();
        highlightPly(n);
        updateNav();
    }

    function reviewGame(game) {
        homeView.style.display = "none";
        playView.style.display = "";
        window.scrollTo(0, 0);
        stopThinking();
        reviewMode = true;
        board.animated = false;
        board.apiLevel = null;
        board.computer = game.userSide === "red" ? 1 : 0;
        board.startFen = game.startFen;
        currentIdx = typeof game.puzzleIdx === "number" ? game.puzzleIdx : -1;
        reviewMoves = (game.moves || []).slice();
        moveSeq = reviewMoves.slice();
        nameEl.textContent = currentIdx >= 0 ? `Puzzle #${currentIdx + 1}` : "Shared game";
        board.result =
            game.result === "win"
                ? RESULT_WIN
                : game.result === "loss"
                    ? RESULT_LOSS
                    : game.result === "draw"
                        ? RESULT_DRAW
                        : RESULT_UNKNOWN;
        updateReviewUI(true);
        if (typeof window.renderCoords === "function") window.renderCoords();
        renderMoves();
        gotoPly(reviewMoves.length);
        renderHistory();
        rescaleBoard();
    }

    function loadPuzzle(idx, side) {
        reviewMode = false;
        updateReviewUI(false);
        stopThinking();
        board.animated = true;
        currentIdx = idx;
        const fen = ChessOnePuzzles.fen(idx);
        const data = parseFen(fen);
        humanSide = side == null ? data.turn : side;
        board.computer = 1 - humanSide;
        board.apiLevel = 1;
        playRed.checked = humanSide === 0;
        playBlack.checked = humanSide === 1;
        moveSeq = [];
        resultShown = false;
        currentGame = newGame(idx, fen, humanSide);
        nameEl.textContent = `Puzzle #${idx + 1}`;
        board.restart(fen);
        if (typeof window.renderCoords === "function") window.renderCoords();
        updateTurn();
        renderMoves();
        renderHistory();
        rescaleBoard();
    }

    function openPuzzle(idx) {
        homeView.style.display = "none";
        playView.style.display = "";
        window.scrollTo(0, 0);
        loadPuzzle(idx, null);
        rescaleBoard();
    }

    function showHome() {
        stopThinking();
        reviewMode = false;
        playView.style.display = "none";
        homeView.style.display = "";
        window.scrollTo(0, 0);
        renderHistory();
    }

    playRed.addEventListener("change", () => {
        if (playRed.checked) loadPuzzle(currentIdx, 0);
    });
    playBlack.addEventListener("change", () => {
        if (playBlack.checked) loadPuzzle(currentIdx, 1);
    });
    btnReplay.addEventListener("click", () => {
        loadPuzzle(currentIdx, humanSide);
    });
    btnNext.addEventListener("click", () => {
        const total = ChessOnePuzzles.count();
        let next = currentIdx;
        if (total > 1) {
            while (next === currentIdx) next = Math.floor(Math.random() * total);
        }
        loadPuzzle(next, null);
    });
    document.getElementById("btnHome").addEventListener("click", showHome);
    navFirst.addEventListener("click", () => {
        gotoPly(0);
    });
    navPrev.addEventListener("click", () => {
        gotoPly(reviewPly - 1);
    });
    navNext.addEventListener("click", () => {
        gotoPly(reviewPly + 1);
    });
    navLast.addEventListener("click", () => {
        gotoPly(reviewMoves.length);
    });
    document.getElementById("btnClearHistory").addEventListener("click", () => {
        if (confirm("Clear all saved games?")) {
            ChessOneHistory.clear();
            renderHistory();
        }
    });
    btnMore.addEventListener("click", () => {
        addCells(9);
    });

    window.addEventListener("resize", rescaleBoard);
    window.addEventListener("orientationchange", rescaleBoard);

    const chkSound = document.getElementById("chkSound");
    if (chkSound) {
        const SOUND_KEY = "chessone.xiangqi.sound";
        let soundOn = false;
        try {
            soundOn = localStorage.getItem(SOUND_KEY) === "1";
        } catch (e) { }
        chkSound.checked = soundOn;
        board.sound = soundOn;
        chkSound.addEventListener("change", function () {
            board.setSound(this.checked);
            try {
                localStorage.setItem(SOUND_KEY, this.checked ? "1" : "0");
            } catch (e) { }
        });
    }

    ChessOneStats.onChange(renderStats);
    renderStats();
    buildHome();
    renderHistory();
    rescaleBoard();

    setTimeout(() => {
        ChessOneHistory.bootSharedGame((g) => {
            renderHistory();
            reviewGame(g);
        });
    }, 0);
})();
