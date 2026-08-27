// node_modules/pako/dist/pako.esm.mjs
var Z_FIXED$1 = 4;
var Z_BINARY = 0;
var Z_TEXT = 1;
var Z_UNKNOWN$1 = 2;
function zero$1(buf) {
  let len = buf.length;
  while (--len >= 0) {
    buf[len] = 0;
  }
}
var STORED_BLOCK = 0;
var STATIC_TREES = 1;
var DYN_TREES = 2;
var MIN_MATCH$1 = 3;
var MAX_MATCH$1 = 258;
var LENGTH_CODES$1 = 29;
var LITERALS$1 = 256;
var L_CODES$1 = LITERALS$1 + 1 + LENGTH_CODES$1;
var D_CODES$1 = 30;
var BL_CODES$1 = 19;
var HEAP_SIZE$1 = 2 * L_CODES$1 + 1;
var MAX_BITS$1 = 15;
var Buf_size = 16;
var MAX_BL_BITS = 7;
var END_BLOCK = 256;
var REP_3_6 = 16;
var REPZ_3_10 = 17;
var REPZ_11_138 = 18;
var extra_lbits = (
  /* extra bits for each length code */
  new Uint8Array([0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0])
);
var extra_dbits = (
  /* extra bits for each distance code */
  new Uint8Array([0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13])
);
var extra_blbits = (
  /* extra bits for each bit length code */
  new Uint8Array([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2, 3, 7])
);
var bl_order = new Uint8Array([16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15]);
var DIST_CODE_LEN = 512;
var static_ltree = new Array((L_CODES$1 + 2) * 2);
zero$1(static_ltree);
var static_dtree = new Array(D_CODES$1 * 2);
zero$1(static_dtree);
var _dist_code = new Array(DIST_CODE_LEN);
zero$1(_dist_code);
var _length_code = new Array(MAX_MATCH$1 - MIN_MATCH$1 + 1);
zero$1(_length_code);
var base_length = new Array(LENGTH_CODES$1);
zero$1(base_length);
var base_dist = new Array(D_CODES$1);
zero$1(base_dist);
function StaticTreeDesc(static_tree, extra_bits, extra_base, elems, max_length) {
  this.static_tree = static_tree;
  this.extra_bits = extra_bits;
  this.extra_base = extra_base;
  this.elems = elems;
  this.max_length = max_length;
  this.has_stree = static_tree && static_tree.length;
}
var static_l_desc;
var static_d_desc;
var static_bl_desc;
function TreeDesc(dyn_tree, stat_desc) {
  this.dyn_tree = dyn_tree;
  this.max_code = 0;
  this.stat_desc = stat_desc;
}
var d_code = (dist) => {
  return dist < 256 ? _dist_code[dist] : _dist_code[256 + (dist >>> 7)];
};
var put_short = (s, w) => {
  s.pending_buf[s.pending++] = w & 255;
  s.pending_buf[s.pending++] = w >>> 8 & 255;
};
var send_bits = (s, value, length) => {
  if (s.bi_valid > Buf_size - length) {
    s.bi_buf |= value << s.bi_valid & 65535;
    put_short(s, s.bi_buf);
    s.bi_buf = value >> Buf_size - s.bi_valid;
    s.bi_valid += length - Buf_size;
  } else {
    s.bi_buf |= value << s.bi_valid & 65535;
    s.bi_valid += length;
  }
};
var send_code = (s, c, tree) => {
  send_bits(
    s,
    tree[c * 2],
    tree[c * 2 + 1]
    /*.Len*/
  );
};
var bi_reverse = (code, len) => {
  let res = 0;
  do {
    res |= code & 1;
    code >>>= 1;
    res <<= 1;
  } while (--len > 0);
  return res >>> 1;
};
var bi_flush = (s) => {
  if (s.bi_valid === 16) {
    put_short(s, s.bi_buf);
    s.bi_buf = 0;
    s.bi_valid = 0;
  } else if (s.bi_valid >= 8) {
    s.pending_buf[s.pending++] = s.bi_buf & 255;
    s.bi_buf >>= 8;
    s.bi_valid -= 8;
  }
};
var gen_bitlen = (s, desc) => {
  const tree = desc.dyn_tree;
  const max_code = desc.max_code;
  const stree = desc.stat_desc.static_tree;
  const has_stree = desc.stat_desc.has_stree;
  const extra = desc.stat_desc.extra_bits;
  const base = desc.stat_desc.extra_base;
  const max_length = desc.stat_desc.max_length;
  let h;
  let n, m;
  let bits;
  let xbits;
  let f;
  let overflow = 0;
  for (bits = 0; bits <= MAX_BITS$1; bits++) {
    s.bl_count[bits] = 0;
  }
  tree[s.heap[s.heap_max] * 2 + 1] = 0;
  for (h = s.heap_max + 1; h < HEAP_SIZE$1; h++) {
    n = s.heap[h];
    bits = tree[tree[n * 2 + 1] * 2 + 1] + 1;
    if (bits > max_length) {
      bits = max_length;
      overflow++;
    }
    tree[n * 2 + 1] = bits;
    if (n > max_code) {
      continue;
    }
    s.bl_count[bits]++;
    xbits = 0;
    if (n >= base) {
      xbits = extra[n - base];
    }
    f = tree[n * 2];
    s.opt_len += f * (bits + xbits);
    if (has_stree) {
      s.static_len += f * (stree[n * 2 + 1] + xbits);
    }
  }
  if (overflow === 0) {
    return;
  }
  do {
    bits = max_length - 1;
    while (s.bl_count[bits] === 0) {
      bits--;
    }
    s.bl_count[bits]--;
    s.bl_count[bits + 1] += 2;
    s.bl_count[max_length]--;
    overflow -= 2;
  } while (overflow > 0);
  for (bits = max_length; bits !== 0; bits--) {
    n = s.bl_count[bits];
    while (n !== 0) {
      m = s.heap[--h];
      if (m > max_code) {
        continue;
      }
      if (tree[m * 2 + 1] !== bits) {
        s.opt_len += (bits - tree[m * 2 + 1]) * tree[m * 2];
        tree[m * 2 + 1] = bits;
      }
      n--;
    }
  }
};
var gen_codes = (tree, max_code, bl_count) => {
  const next_code = new Array(MAX_BITS$1 + 1);
  let code = 0;
  let bits;
  let n;
  for (bits = 1; bits <= MAX_BITS$1; bits++) {
    code = code + bl_count[bits - 1] << 1;
    next_code[bits] = code;
  }
  for (n = 0; n <= max_code; n++) {
    let len = tree[n * 2 + 1];
    if (len === 0) {
      continue;
    }
    tree[n * 2] = bi_reverse(next_code[len]++, len);
  }
};
var tr_static_init = () => {
  let n;
  let bits;
  let length;
  let code;
  let dist;
  const bl_count = new Array(MAX_BITS$1 + 1);
  length = 0;
  for (code = 0; code < LENGTH_CODES$1 - 1; code++) {
    base_length[code] = length;
    for (n = 0; n < 1 << extra_lbits[code]; n++) {
      _length_code[length++] = code;
    }
  }
  _length_code[length - 1] = code;
  dist = 0;
  for (code = 0; code < 16; code++) {
    base_dist[code] = dist;
    for (n = 0; n < 1 << extra_dbits[code]; n++) {
      _dist_code[dist++] = code;
    }
  }
  dist >>= 7;
  for (; code < D_CODES$1; code++) {
    base_dist[code] = dist << 7;
    for (n = 0; n < 1 << extra_dbits[code] - 7; n++) {
      _dist_code[256 + dist++] = code;
    }
  }
  for (bits = 0; bits <= MAX_BITS$1; bits++) {
    bl_count[bits] = 0;
  }
  n = 0;
  while (n <= 143) {
    static_ltree[n * 2 + 1] = 8;
    n++;
    bl_count[8]++;
  }
  while (n <= 255) {
    static_ltree[n * 2 + 1] = 9;
    n++;
    bl_count[9]++;
  }
  while (n <= 279) {
    static_ltree[n * 2 + 1] = 7;
    n++;
    bl_count[7]++;
  }
  while (n <= 287) {
    static_ltree[n * 2 + 1] = 8;
    n++;
    bl_count[8]++;
  }
  gen_codes(static_ltree, L_CODES$1 + 1, bl_count);
  for (n = 0; n < D_CODES$1; n++) {
    static_dtree[n * 2 + 1] = 5;
    static_dtree[n * 2] = bi_reverse(n, 5);
  }
  static_l_desc = new StaticTreeDesc(static_ltree, extra_lbits, LITERALS$1 + 1, L_CODES$1, MAX_BITS$1);
  static_d_desc = new StaticTreeDesc(static_dtree, extra_dbits, 0, D_CODES$1, MAX_BITS$1);
  static_bl_desc = new StaticTreeDesc(new Array(0), extra_blbits, 0, BL_CODES$1, MAX_BL_BITS);
};
var init_block = (s) => {
  let n;
  for (n = 0; n < L_CODES$1; n++) {
    s.dyn_ltree[n * 2] = 0;
  }
  for (n = 0; n < D_CODES$1; n++) {
    s.dyn_dtree[n * 2] = 0;
  }
  for (n = 0; n < BL_CODES$1; n++) {
    s.bl_tree[n * 2] = 0;
  }
  s.dyn_ltree[END_BLOCK * 2] = 1;
  s.opt_len = s.static_len = 0;
  s.sym_next = s.matches = 0;
};
var bi_windup = (s) => {
  if (s.bi_valid > 8) {
    put_short(s, s.bi_buf);
  } else if (s.bi_valid > 0) {
    s.pending_buf[s.pending++] = s.bi_buf;
  }
  s.bi_buf = 0;
  s.bi_valid = 0;
};
var smaller = (tree, n, m, depth) => {
  const _n2 = n * 2;
  const _m2 = m * 2;
  return tree[_n2] < tree[_m2] || tree[_n2] === tree[_m2] && depth[n] <= depth[m];
};
var pqdownheap = (s, tree, k) => {
  const v = s.heap[k];
  let j = k << 1;
  while (j <= s.heap_len) {
    if (j < s.heap_len && smaller(tree, s.heap[j + 1], s.heap[j], s.depth)) {
      j++;
    }
    if (smaller(tree, v, s.heap[j], s.depth)) {
      break;
    }
    s.heap[k] = s.heap[j];
    k = j;
    j <<= 1;
  }
  s.heap[k] = v;
};
var compress_block = (s, ltree, dtree) => {
  let dist;
  let lc;
  let sx = 0;
  let code;
  let extra;
  if (s.sym_next !== 0) {
    do {
      dist = s.pending_buf[s.sym_buf + sx++] & 255;
      dist += (s.pending_buf[s.sym_buf + sx++] & 255) << 8;
      lc = s.pending_buf[s.sym_buf + sx++];
      if (dist === 0) {
        send_code(s, lc, ltree);
      } else {
        code = _length_code[lc];
        send_code(s, code + LITERALS$1 + 1, ltree);
        extra = extra_lbits[code];
        if (extra !== 0) {
          lc -= base_length[code];
          send_bits(s, lc, extra);
        }
        dist--;
        code = d_code(dist);
        send_code(s, code, dtree);
        extra = extra_dbits[code];
        if (extra !== 0) {
          dist -= base_dist[code];
          send_bits(s, dist, extra);
        }
      }
    } while (sx < s.sym_next);
  }
  send_code(s, END_BLOCK, ltree);
};
var build_tree = (s, desc) => {
  const tree = desc.dyn_tree;
  const stree = desc.stat_desc.static_tree;
  const has_stree = desc.stat_desc.has_stree;
  const elems = desc.stat_desc.elems;
  let n, m;
  let max_code = -1;
  let node;
  s.heap_len = 0;
  s.heap_max = HEAP_SIZE$1;
  for (n = 0; n < elems; n++) {
    if (tree[n * 2] !== 0) {
      s.heap[++s.heap_len] = max_code = n;
      s.depth[n] = 0;
    } else {
      tree[n * 2 + 1] = 0;
    }
  }
  while (s.heap_len < 2) {
    node = s.heap[++s.heap_len] = max_code < 2 ? ++max_code : 0;
    tree[node * 2] = 1;
    s.depth[node] = 0;
    s.opt_len--;
    if (has_stree) {
      s.static_len -= stree[node * 2 + 1];
    }
  }
  desc.max_code = max_code;
  for (n = s.heap_len >> 1; n >= 1; n--) {
    pqdownheap(s, tree, n);
  }
  node = elems;
  do {
    n = s.heap[
      1
      /*SMALLEST*/
    ];
    s.heap[
      1
      /*SMALLEST*/
    ] = s.heap[s.heap_len--];
    pqdownheap(
      s,
      tree,
      1
      /*SMALLEST*/
    );
    m = s.heap[
      1
      /*SMALLEST*/
    ];
    s.heap[--s.heap_max] = n;
    s.heap[--s.heap_max] = m;
    tree[node * 2] = tree[n * 2] + tree[m * 2];
    s.depth[node] = (s.depth[n] >= s.depth[m] ? s.depth[n] : s.depth[m]) + 1;
    tree[n * 2 + 1] = tree[m * 2 + 1] = node;
    s.heap[
      1
      /*SMALLEST*/
    ] = node++;
    pqdownheap(
      s,
      tree,
      1
      /*SMALLEST*/
    );
  } while (s.heap_len >= 2);
  s.heap[--s.heap_max] = s.heap[
    1
    /*SMALLEST*/
  ];
  gen_bitlen(s, desc);
  gen_codes(tree, max_code, s.bl_count);
};
var scan_tree = (s, tree, max_code) => {
  let n;
  let prevlen = -1;
  let curlen;
  let nextlen = tree[0 * 2 + 1];
  let count = 0;
  let max_count = 7;
  let min_count = 4;
  if (nextlen === 0) {
    max_count = 138;
    min_count = 3;
  }
  tree[(max_code + 1) * 2 + 1] = 65535;
  for (n = 0; n <= max_code; n++) {
    curlen = nextlen;
    nextlen = tree[(n + 1) * 2 + 1];
    if (++count < max_count && curlen === nextlen) {
      continue;
    } else if (count < min_count) {
      s.bl_tree[curlen * 2] += count;
    } else if (curlen !== 0) {
      if (curlen !== prevlen) {
        s.bl_tree[curlen * 2]++;
      }
      s.bl_tree[REP_3_6 * 2]++;
    } else if (count <= 10) {
      s.bl_tree[REPZ_3_10 * 2]++;
    } else {
      s.bl_tree[REPZ_11_138 * 2]++;
    }
    count = 0;
    prevlen = curlen;
    if (nextlen === 0) {
      max_count = 138;
      min_count = 3;
    } else if (curlen === nextlen) {
      max_count = 6;
      min_count = 3;
    } else {
      max_count = 7;
      min_count = 4;
    }
  }
};
var send_tree = (s, tree, max_code) => {
  let n;
  let prevlen = -1;
  let curlen;
  let nextlen = tree[0 * 2 + 1];
  let count = 0;
  let max_count = 7;
  let min_count = 4;
  if (nextlen === 0) {
    max_count = 138;
    min_count = 3;
  }
  for (n = 0; n <= max_code; n++) {
    curlen = nextlen;
    nextlen = tree[(n + 1) * 2 + 1];
    if (++count < max_count && curlen === nextlen) {
      continue;
    } else if (count < min_count) {
      do {
        send_code(s, curlen, s.bl_tree);
      } while (--count !== 0);
    } else if (curlen !== 0) {
      if (curlen !== prevlen) {
        send_code(s, curlen, s.bl_tree);
        count--;
      }
      send_code(s, REP_3_6, s.bl_tree);
      send_bits(s, count - 3, 2);
    } else if (count <= 10) {
      send_code(s, REPZ_3_10, s.bl_tree);
      send_bits(s, count - 3, 3);
    } else {
      send_code(s, REPZ_11_138, s.bl_tree);
      send_bits(s, count - 11, 7);
    }
    count = 0;
    prevlen = curlen;
    if (nextlen === 0) {
      max_count = 138;
      min_count = 3;
    } else if (curlen === nextlen) {
      max_count = 6;
      min_count = 3;
    } else {
      max_count = 7;
      min_count = 4;
    }
  }
};
var build_bl_tree = (s) => {
  let max_blindex;
  scan_tree(s, s.dyn_ltree, s.l_desc.max_code);
  scan_tree(s, s.dyn_dtree, s.d_desc.max_code);
  build_tree(s, s.bl_desc);
  for (max_blindex = BL_CODES$1 - 1; max_blindex >= 3; max_blindex--) {
    if (s.bl_tree[bl_order[max_blindex] * 2 + 1] !== 0) {
      break;
    }
  }
  s.opt_len += 3 * (max_blindex + 1) + 5 + 5 + 4;
  return max_blindex;
};
var send_all_trees = (s, lcodes, dcodes, blcodes) => {
  let rank2;
  send_bits(s, lcodes - 257, 5);
  send_bits(s, dcodes - 1, 5);
  send_bits(s, blcodes - 4, 4);
  for (rank2 = 0; rank2 < blcodes; rank2++) {
    send_bits(s, s.bl_tree[bl_order[rank2] * 2 + 1], 3);
  }
  send_tree(s, s.dyn_ltree, lcodes - 1);
  send_tree(s, s.dyn_dtree, dcodes - 1);
};
var detect_data_type = (s) => {
  let block_mask = 4093624447;
  let n;
  for (n = 0; n <= 31; n++, block_mask >>>= 1) {
    if (block_mask & 1 && s.dyn_ltree[n * 2] !== 0) {
      return Z_BINARY;
    }
  }
  if (s.dyn_ltree[9 * 2] !== 0 || s.dyn_ltree[10 * 2] !== 0 || s.dyn_ltree[13 * 2] !== 0) {
    return Z_TEXT;
  }
  for (n = 32; n < LITERALS$1; n++) {
    if (s.dyn_ltree[n * 2] !== 0) {
      return Z_TEXT;
    }
  }
  return Z_BINARY;
};
var static_init_done = false;
var _tr_init$1 = (s) => {
  if (!static_init_done) {
    tr_static_init();
    static_init_done = true;
  }
  s.l_desc = new TreeDesc(s.dyn_ltree, static_l_desc);
  s.d_desc = new TreeDesc(s.dyn_dtree, static_d_desc);
  s.bl_desc = new TreeDesc(s.bl_tree, static_bl_desc);
  s.bi_buf = 0;
  s.bi_valid = 0;
  init_block(s);
};
var _tr_stored_block$1 = (s, buf, stored_len, last) => {
  send_bits(s, (STORED_BLOCK << 1) + (last ? 1 : 0), 3);
  bi_windup(s);
  put_short(s, stored_len);
  put_short(s, ~stored_len);
  if (stored_len) {
    s.pending_buf.set(s.window.subarray(buf, buf + stored_len), s.pending);
  }
  s.pending += stored_len;
};
var _tr_align$1 = (s) => {
  send_bits(s, STATIC_TREES << 1, 3);
  send_code(s, END_BLOCK, static_ltree);
  bi_flush(s);
};
var _tr_flush_block$1 = (s, buf, stored_len, last) => {
  let opt_lenb, static_lenb;
  let max_blindex = 0;
  if (s.level > 0) {
    if (s.strm.data_type === Z_UNKNOWN$1) {
      s.strm.data_type = detect_data_type(s);
    }
    build_tree(s, s.l_desc);
    build_tree(s, s.d_desc);
    max_blindex = build_bl_tree(s);
    opt_lenb = s.opt_len + 3 + 7 >>> 3;
    static_lenb = s.static_len + 3 + 7 >>> 3;
    if (static_lenb <= opt_lenb) {
      opt_lenb = static_lenb;
    }
  } else {
    opt_lenb = static_lenb = stored_len + 5;
  }
  if (stored_len + 4 <= opt_lenb && buf !== -1) {
    _tr_stored_block$1(s, buf, stored_len, last);
  } else if (s.strategy === Z_FIXED$1 || static_lenb === opt_lenb) {
    send_bits(s, (STATIC_TREES << 1) + (last ? 1 : 0), 3);
    compress_block(s, static_ltree, static_dtree);
  } else {
    send_bits(s, (DYN_TREES << 1) + (last ? 1 : 0), 3);
    send_all_trees(s, s.l_desc.max_code + 1, s.d_desc.max_code + 1, max_blindex + 1);
    compress_block(s, s.dyn_ltree, s.dyn_dtree);
  }
  init_block(s);
  if (last) {
    bi_windup(s);
  }
};
var _tr_tally$1 = (s, dist, lc) => {
  s.pending_buf[s.sym_buf + s.sym_next++] = dist;
  s.pending_buf[s.sym_buf + s.sym_next++] = dist >> 8;
  s.pending_buf[s.sym_buf + s.sym_next++] = lc;
  if (dist === 0) {
    s.dyn_ltree[lc * 2]++;
  } else {
    s.matches++;
    dist--;
    s.dyn_ltree[(_length_code[lc] + LITERALS$1 + 1) * 2]++;
    s.dyn_dtree[d_code(dist) * 2]++;
  }
  return s.sym_next === s.sym_end;
};
var _tr_init_1 = _tr_init$1;
var _tr_stored_block_1 = _tr_stored_block$1;
var _tr_flush_block_1 = _tr_flush_block$1;
var _tr_tally_1 = _tr_tally$1;
var _tr_align_1 = _tr_align$1;
var trees = {
  _tr_init: _tr_init_1,
  _tr_stored_block: _tr_stored_block_1,
  _tr_flush_block: _tr_flush_block_1,
  _tr_tally: _tr_tally_1,
  _tr_align: _tr_align_1
};
var adler32 = (adler, buf, len, pos) => {
  let s1 = adler & 65535 | 0, s2 = adler >>> 16 & 65535 | 0, n = 0;
  while (len !== 0) {
    n = len > 2e3 ? 2e3 : len;
    len -= n;
    do {
      s1 = s1 + buf[pos++] | 0;
      s2 = s2 + s1 | 0;
    } while (--n);
    s1 %= 65521;
    s2 %= 65521;
  }
  return s1 | s2 << 16 | 0;
};
var adler32_1 = adler32;
var makeTable = () => {
  let c, table2 = [];
  for (var n = 0; n < 256; n++) {
    c = n;
    for (var k = 0; k < 8; k++) {
      c = c & 1 ? 3988292384 ^ c >>> 1 : c >>> 1;
    }
    table2[n] = c;
  }
  return table2;
};
var crcTable = new Uint32Array(makeTable());
var crc32 = (crc, buf, len, pos) => {
  const t = crcTable;
  const end = pos + len;
  crc ^= -1;
  for (let i = pos; i < end; i++) {
    crc = crc >>> 8 ^ t[(crc ^ buf[i]) & 255];
  }
  return crc ^ -1;
};
var crc32_1 = crc32;
var messages = {
  2: "need dictionary",
  /* Z_NEED_DICT       2  */
  1: "stream end",
  /* Z_STREAM_END      1  */
  0: "",
  /* Z_OK              0  */
  "-1": "file error",
  /* Z_ERRNO         (-1) */
  "-2": "stream error",
  /* Z_STREAM_ERROR  (-2) */
  "-3": "data error",
  /* Z_DATA_ERROR    (-3) */
  "-4": "insufficient memory",
  /* Z_MEM_ERROR     (-4) */
  "-5": "buffer error",
  /* Z_BUF_ERROR     (-5) */
  "-6": "incompatible version"
  /* Z_VERSION_ERROR (-6) */
};
var constants$2 = {
  /* Allowed flush values; see deflate() and inflate() below for details */
  Z_NO_FLUSH: 0,
  Z_PARTIAL_FLUSH: 1,
  Z_SYNC_FLUSH: 2,
  Z_FULL_FLUSH: 3,
  Z_FINISH: 4,
  Z_BLOCK: 5,
  Z_TREES: 6,
  /* Return codes for the compression/decompression functions. Negative values
  * are errors, positive values are used for special but normal events.
  */
  Z_OK: 0,
  Z_STREAM_END: 1,
  Z_NEED_DICT: 2,
  Z_ERRNO: -1,
  Z_STREAM_ERROR: -2,
  Z_DATA_ERROR: -3,
  Z_MEM_ERROR: -4,
  Z_BUF_ERROR: -5,
  //Z_VERSION_ERROR: -6,
  /* compression levels */
  Z_NO_COMPRESSION: 0,
  Z_BEST_SPEED: 1,
  Z_BEST_COMPRESSION: 9,
  Z_DEFAULT_COMPRESSION: -1,
  Z_FILTERED: 1,
  Z_HUFFMAN_ONLY: 2,
  Z_RLE: 3,
  Z_FIXED: 4,
  Z_DEFAULT_STRATEGY: 0,
  /* Possible values of the data_type field (though see inflate()) */
  Z_BINARY: 0,
  Z_TEXT: 1,
  //Z_ASCII:                1, // = Z_TEXT (deprecated)
  Z_UNKNOWN: 2,
  /* The deflate compression method */
  Z_DEFLATED: 8
  //Z_NULL:                 null // Use -1 or null inline, depending on var type
};
var { _tr_init, _tr_stored_block, _tr_flush_block, _tr_tally, _tr_align } = trees;
var {
  Z_NO_FLUSH: Z_NO_FLUSH$2,
  Z_PARTIAL_FLUSH,
  Z_FULL_FLUSH: Z_FULL_FLUSH$1,
  Z_FINISH: Z_FINISH$3,
  Z_BLOCK: Z_BLOCK$1,
  Z_OK: Z_OK$3,
  Z_STREAM_END: Z_STREAM_END$3,
  Z_STREAM_ERROR: Z_STREAM_ERROR$2,
  Z_DATA_ERROR: Z_DATA_ERROR$2,
  Z_BUF_ERROR: Z_BUF_ERROR$2,
  Z_DEFAULT_COMPRESSION: Z_DEFAULT_COMPRESSION$1,
  Z_FILTERED,
  Z_HUFFMAN_ONLY,
  Z_RLE,
  Z_FIXED,
  Z_DEFAULT_STRATEGY: Z_DEFAULT_STRATEGY$1,
  Z_UNKNOWN,
  Z_DEFLATED: Z_DEFLATED$2
} = constants$2;
var MAX_MEM_LEVEL = 9;
var MAX_WBITS$1 = 15;
var DEF_MEM_LEVEL = 8;
var LENGTH_CODES = 29;
var LITERALS = 256;
var L_CODES = LITERALS + 1 + LENGTH_CODES;
var D_CODES = 30;
var BL_CODES = 19;
var HEAP_SIZE = 2 * L_CODES + 1;
var MAX_BITS = 15;
var MIN_MATCH = 3;
var MAX_MATCH = 258;
var MIN_LOOKAHEAD = MAX_MATCH + MIN_MATCH + 1;
var PRESET_DICT = 32;
var INIT_STATE = 42;
var GZIP_STATE = 57;
var EXTRA_STATE = 69;
var NAME_STATE = 73;
var COMMENT_STATE = 91;
var HCRC_STATE = 103;
var BUSY_STATE = 113;
var FINISH_STATE = 666;
var BS_NEED_MORE = 1;
var BS_BLOCK_DONE = 2;
var BS_FINISH_STARTED = 3;
var BS_FINISH_DONE = 4;
var OS_CODE = 3;
var err = (strm, errorCode) => {
  strm.msg = messages[errorCode];
  return errorCode;
};
var rank = (f) => {
  return f * 2 - (f > 4 ? 9 : 0);
};
var zero = (buf) => {
  let len = buf.length;
  while (--len >= 0) {
    buf[len] = 0;
  }
};
var slide_hash = (s) => {
  let n, m;
  let p;
  let wsize = s.w_size;
  n = s.hash_size;
  p = n;
  do {
    m = s.head[--p];
    s.head[p] = m >= wsize ? m - wsize : 0;
  } while (--n);
  n = wsize;
  p = n;
  do {
    m = s.prev[--p];
    s.prev[p] = m >= wsize ? m - wsize : 0;
  } while (--n);
};
var HASH = (s, prev, data) => (prev << s.hash_shift ^ data) & s.hash_mask;
var INSERT_STRING = (s, str) => {
  let h;
  if (s.legacy_hash) {
    h = s.ins_h = HASH(s, s.ins_h, s.window[str + MIN_MATCH - 1]);
  } else {
    const w = s.window;
    const value = w[str] | w[str + 1] << 8 | w[str + 2] << 16 | w[str + 3] << 24;
    h = s.ins_h = Math.imul(value, 66521) + 66521 >>> 16 & s.hash_mask;
  }
  const hash_head = s.prev[str & s.w_mask] = s.head[h];
  s.head[h] = str;
  return hash_head;
};
var flush_pending = (strm) => {
  const s = strm.state;
  let len = s.pending;
  if (len > strm.avail_out) {
    len = strm.avail_out;
  }
  if (len === 0) {
    return;
  }
  strm.output.set(s.pending_buf.subarray(s.pending_out, s.pending_out + len), strm.next_out);
  strm.next_out += len;
  s.pending_out += len;
  strm.total_out += len;
  strm.avail_out -= len;
  s.pending -= len;
  if (s.pending === 0) {
    s.pending_out = 0;
  }
};
var flush_block_only = (s, last) => {
  _tr_flush_block(s, s.block_start >= 0 ? s.block_start : -1, s.strstart - s.block_start, last);
  s.block_start = s.strstart;
  flush_pending(s.strm);
};
var put_byte = (s, b) => {
  s.pending_buf[s.pending++] = b;
};
var putShortMSB = (s, b) => {
  s.pending_buf[s.pending++] = b >>> 8 & 255;
  s.pending_buf[s.pending++] = b & 255;
};
var read_buf = (strm, buf, start, size) => {
  let len = strm.avail_in;
  if (len > size) {
    len = size;
  }
  if (len === 0) {
    return 0;
  }
  strm.avail_in -= len;
  buf.set(strm.input.subarray(strm.next_in, strm.next_in + len), start);
  if (strm.state.wrap === 1) {
    strm.adler = adler32_1(strm.adler, buf, len, start);
  } else if (strm.state.wrap === 2) {
    strm.adler = crc32_1(strm.adler, buf, len, start);
  }
  strm.next_in += len;
  strm.total_in += len;
  return len;
};
var longest_match = (s, cur_match) => {
  let chain_length = s.max_chain_length;
  let scan = s.strstart;
  let match;
  let len;
  let best_len = s.prev_length;
  let nice_match = s.nice_match;
  const limit = s.strstart > s.w_size - MIN_LOOKAHEAD ? s.strstart - (s.w_size - MIN_LOOKAHEAD) : 0;
  const _win = s.window;
  const wmask = s.w_mask;
  const prev = s.prev;
  const strend = s.strstart + MAX_MATCH;
  let scan_end1 = _win[scan + best_len - 1];
  let scan_end = _win[scan + best_len];
  if (s.prev_length >= s.good_match) {
    chain_length >>= 2;
  }
  if (nice_match > s.lookahead) {
    nice_match = s.lookahead;
  }
  do {
    match = cur_match;
    if (_win[match + best_len] !== scan_end || _win[match + best_len - 1] !== scan_end1 || _win[match] !== _win[scan] || _win[++match] !== _win[scan + 1]) {
      continue;
    }
    scan += 2;
    match++;
    do {
    } while (_win[++scan] === _win[++match] && _win[++scan] === _win[++match] && _win[++scan] === _win[++match] && _win[++scan] === _win[++match] && _win[++scan] === _win[++match] && _win[++scan] === _win[++match] && _win[++scan] === _win[++match] && _win[++scan] === _win[++match] && scan < strend);
    len = MAX_MATCH - (strend - scan);
    scan = strend - MAX_MATCH;
    if (len > best_len) {
      s.match_start = cur_match;
      best_len = len;
      if (len >= nice_match) {
        break;
      }
      scan_end1 = _win[scan + best_len - 1];
      scan_end = _win[scan + best_len];
    }
  } while ((cur_match = prev[cur_match & wmask]) > limit && --chain_length !== 0);
  if (best_len <= s.lookahead) {
    return best_len;
  }
  return s.lookahead;
};
var fill_window = (s) => {
  const _w_size = s.w_size;
  let n, more, str;
  do {
    more = s.window_size - s.lookahead - s.strstart;
    if (s.strstart >= _w_size + (_w_size - MIN_LOOKAHEAD)) {
      s.window.set(s.window.subarray(_w_size, _w_size + _w_size - more), 0);
      s.match_start -= _w_size;
      s.strstart -= _w_size;
      s.block_start -= _w_size;
      if (s.insert > s.strstart) {
        s.insert = s.strstart;
      }
      slide_hash(s);
      more += _w_size;
    }
    if (s.strm.avail_in === 0) {
      break;
    }
    n = read_buf(s.strm, s.window, s.strstart + s.lookahead, more);
    s.lookahead += n;
    if (!s.legacy_hash) {
      if (s.lookahead + s.insert > MIN_MATCH) {
        str = s.strstart - s.insert;
        while (s.insert) {
          INSERT_STRING(s, str);
          str++;
          s.insert--;
          if (s.lookahead + s.insert <= MIN_MATCH) {
            break;
          }
        }
      }
    } else if (s.lookahead + s.insert >= MIN_MATCH) {
      str = s.strstart - s.insert;
      s.ins_h = s.window[str];
      s.ins_h = HASH(s, s.ins_h, s.window[str + 1]);
      while (s.insert) {
        INSERT_STRING(s, str);
        str++;
        s.insert--;
        if (s.lookahead + s.insert < MIN_MATCH) {
          break;
        }
      }
    }
  } while (s.lookahead < MIN_LOOKAHEAD && s.strm.avail_in !== 0);
};
var deflate_stored = (s, flush) => {
  let min_block = s.pending_buf_size - 5 > s.w_size ? s.w_size : s.pending_buf_size - 5;
  let len, left, have, last = 0;
  let used = s.strm.avail_in;
  do {
    len = 65535;
    have = s.bi_valid + 42 >> 3;
    if (s.strm.avail_out < have) {
      break;
    }
    have = s.strm.avail_out - have;
    left = s.strstart - s.block_start;
    if (len > left + s.strm.avail_in) {
      len = left + s.strm.avail_in;
    }
    if (len > have) {
      len = have;
    }
    if (len < min_block && (len === 0 && flush !== Z_FINISH$3 || flush === Z_NO_FLUSH$2 || len !== left + s.strm.avail_in)) {
      break;
    }
    last = flush === Z_FINISH$3 && len === left + s.strm.avail_in ? 1 : 0;
    _tr_stored_block(s, 0, 0, last);
    s.pending_buf[s.pending - 4] = len;
    s.pending_buf[s.pending - 3] = len >> 8;
    s.pending_buf[s.pending - 2] = ~len;
    s.pending_buf[s.pending - 1] = ~len >> 8;
    flush_pending(s.strm);
    if (left) {
      if (left > len) {
        left = len;
      }
      s.strm.output.set(s.window.subarray(s.block_start, s.block_start + left), s.strm.next_out);
      s.strm.next_out += left;
      s.strm.avail_out -= left;
      s.strm.total_out += left;
      s.block_start += left;
      len -= left;
    }
    if (len) {
      read_buf(s.strm, s.strm.output, s.strm.next_out, len);
      s.strm.next_out += len;
      s.strm.avail_out -= len;
      s.strm.total_out += len;
    }
  } while (last === 0);
  used -= s.strm.avail_in;
  if (used) {
    if (used >= s.w_size) {
      s.matches = 2;
      s.window.set(s.strm.input.subarray(s.strm.next_in - s.w_size, s.strm.next_in), 0);
      s.strstart = s.w_size;
      s.insert = s.strstart;
    } else {
      if (s.window_size - s.strstart <= used) {
        s.strstart -= s.w_size;
        s.window.set(s.window.subarray(s.w_size, s.w_size + s.strstart), 0);
        if (s.matches < 2) {
          s.matches++;
        }
        if (s.insert > s.strstart) {
          s.insert = s.strstart;
        }
      }
      s.window.set(s.strm.input.subarray(s.strm.next_in - used, s.strm.next_in), s.strstart);
      s.strstart += used;
      s.insert += used > s.w_size - s.insert ? s.w_size - s.insert : used;
    }
    s.block_start = s.strstart;
  }
  if (s.high_water < s.strstart) {
    s.high_water = s.strstart;
  }
  if (last) {
    return BS_FINISH_DONE;
  }
  if (flush !== Z_NO_FLUSH$2 && flush !== Z_FINISH$3 && s.strm.avail_in === 0 && s.strstart === s.block_start) {
    return BS_BLOCK_DONE;
  }
  have = s.window_size - s.strstart;
  if (s.strm.avail_in > have && s.block_start >= s.w_size) {
    s.block_start -= s.w_size;
    s.strstart -= s.w_size;
    s.window.set(s.window.subarray(s.w_size, s.w_size + s.strstart), 0);
    if (s.matches < 2) {
      s.matches++;
    }
    have += s.w_size;
    if (s.insert > s.strstart) {
      s.insert = s.strstart;
    }
  }
  if (have > s.strm.avail_in) {
    have = s.strm.avail_in;
  }
  if (have) {
    read_buf(s.strm, s.window, s.strstart, have);
    s.strstart += have;
    s.insert += have > s.w_size - s.insert ? s.w_size - s.insert : have;
  }
  if (s.high_water < s.strstart) {
    s.high_water = s.strstart;
  }
  have = s.bi_valid + 42 >> 3;
  have = s.pending_buf_size - have > 65535 ? 65535 : s.pending_buf_size - have;
  min_block = have > s.w_size ? s.w_size : have;
  left = s.strstart - s.block_start;
  if (left >= min_block || (left || flush === Z_FINISH$3) && flush !== Z_NO_FLUSH$2 && s.strm.avail_in === 0 && left <= have) {
    len = left > have ? have : left;
    last = flush === Z_FINISH$3 && s.strm.avail_in === 0 && len === left ? 1 : 0;
    _tr_stored_block(s, s.block_start, len, last);
    s.block_start += len;
    flush_pending(s.strm);
  }
  return last ? BS_FINISH_STARTED : BS_NEED_MORE;
};
var deflate_fast = (s, flush) => {
  let hash_head;
  let bflush;
  for (; ; ) {
    if (s.lookahead < MIN_LOOKAHEAD) {
      fill_window(s);
      if (s.lookahead < MIN_LOOKAHEAD && flush === Z_NO_FLUSH$2) {
        return BS_NEED_MORE;
      }
      if (s.lookahead === 0) {
        break;
      }
    }
    hash_head = 0;
    if (s.lookahead >= MIN_MATCH) {
      hash_head = INSERT_STRING(s, s.strstart);
    }
    if (hash_head !== 0 && s.strstart - hash_head <= s.w_size - MIN_LOOKAHEAD) {
      s.match_length = longest_match(s, hash_head);
    }
    if (s.match_length >= MIN_MATCH) {
      bflush = _tr_tally(s, s.strstart - s.match_start, s.match_length - MIN_MATCH);
      s.lookahead -= s.match_length;
      if (s.match_length <= s.max_lazy_match && s.lookahead >= MIN_MATCH) {
        s.match_length--;
        do {
          s.strstart++;
          hash_head = INSERT_STRING(s, s.strstart);
        } while (--s.match_length !== 0);
        s.strstart++;
      } else {
        s.strstart += s.match_length;
        s.match_length = 0;
        if (s.legacy_hash) {
          s.ins_h = s.window[s.strstart];
          s.ins_h = HASH(s, s.ins_h, s.window[s.strstart + 1]);
        }
      }
    } else {
      bflush = _tr_tally(s, 0, s.window[s.strstart]);
      s.lookahead--;
      s.strstart++;
    }
    if (bflush) {
      flush_block_only(s, false);
      if (s.strm.avail_out === 0) {
        return BS_NEED_MORE;
      }
    }
  }
  s.insert = s.strstart < MIN_MATCH - 1 ? s.strstart : MIN_MATCH - 1;
  if (flush === Z_FINISH$3) {
    flush_block_only(s, true);
    if (s.strm.avail_out === 0) {
      return BS_FINISH_STARTED;
    }
    return BS_FINISH_DONE;
  }
  if (s.sym_next) {
    flush_block_only(s, false);
    if (s.strm.avail_out === 0) {
      return BS_NEED_MORE;
    }
  }
  return BS_BLOCK_DONE;
};
var deflate_slow = (s, flush) => {
  let hash_head;
  let bflush;
  let max_insert;
  for (; ; ) {
    if (s.lookahead < MIN_LOOKAHEAD) {
      fill_window(s);
      if (s.lookahead < MIN_LOOKAHEAD && flush === Z_NO_FLUSH$2) {
        return BS_NEED_MORE;
      }
      if (s.lookahead === 0) {
        break;
      }
    }
    hash_head = 0;
    if (s.lookahead >= MIN_MATCH) {
      hash_head = INSERT_STRING(s, s.strstart);
    }
    s.prev_length = s.match_length;
    s.prev_match = s.match_start;
    s.match_length = MIN_MATCH - 1;
    if (hash_head !== 0 && s.prev_length < s.max_lazy_match && s.strstart - hash_head <= s.w_size - MIN_LOOKAHEAD) {
      s.match_length = longest_match(s, hash_head);
      if (s.match_length <= 5 && (s.strategy === Z_FILTERED || s.match_length === MIN_MATCH && s.strstart - s.match_start > 4096)) {
        s.match_length = MIN_MATCH - 1;
      }
    }
    if (s.prev_length >= MIN_MATCH && s.match_length <= s.prev_length) {
      max_insert = s.strstart + s.lookahead - MIN_MATCH;
      bflush = _tr_tally(s, s.strstart - 1 - s.prev_match, s.prev_length - MIN_MATCH);
      s.lookahead -= s.prev_length - 1;
      s.prev_length -= 2;
      do {
        if (++s.strstart <= max_insert) {
          hash_head = INSERT_STRING(s, s.strstart);
        }
      } while (--s.prev_length !== 0);
      s.match_available = 0;
      s.match_length = MIN_MATCH - 1;
      s.strstart++;
      if (bflush) {
        flush_block_only(s, false);
        if (s.strm.avail_out === 0) {
          return BS_NEED_MORE;
        }
      }
    } else if (s.match_available) {
      bflush = _tr_tally(s, 0, s.window[s.strstart - 1]);
      if (bflush) {
        flush_block_only(s, false);
      }
      s.strstart++;
      s.lookahead--;
      if (s.strm.avail_out === 0) {
        return BS_NEED_MORE;
      }
    } else {
      s.match_available = 1;
      s.strstart++;
      s.lookahead--;
    }
  }
  if (s.match_available) {
    bflush = _tr_tally(s, 0, s.window[s.strstart - 1]);
    s.match_available = 0;
  }
  s.insert = s.strstart < MIN_MATCH - 1 ? s.strstart : MIN_MATCH - 1;
  if (flush === Z_FINISH$3) {
    flush_block_only(s, true);
    if (s.strm.avail_out === 0) {
      return BS_FINISH_STARTED;
    }
    return BS_FINISH_DONE;
  }
  if (s.sym_next) {
    flush_block_only(s, false);
    if (s.strm.avail_out === 0) {
      return BS_NEED_MORE;
    }
  }
  return BS_BLOCK_DONE;
};
var deflate_rle = (s, flush) => {
  let bflush;
  let prev;
  let scan, strend;
  const _win = s.window;
  for (; ; ) {
    if (s.lookahead <= MAX_MATCH) {
      fill_window(s);
      if (s.lookahead <= MAX_MATCH && flush === Z_NO_FLUSH$2) {
        return BS_NEED_MORE;
      }
      if (s.lookahead === 0) {
        break;
      }
    }
    s.match_length = 0;
    if (s.lookahead >= MIN_MATCH && s.strstart > 0) {
      scan = s.strstart - 1;
      prev = _win[scan];
      if (prev === _win[++scan] && prev === _win[++scan] && prev === _win[++scan]) {
        strend = s.strstart + MAX_MATCH;
        do {
        } while (prev === _win[++scan] && prev === _win[++scan] && prev === _win[++scan] && prev === _win[++scan] && prev === _win[++scan] && prev === _win[++scan] && prev === _win[++scan] && prev === _win[++scan] && scan < strend);
        s.match_length = MAX_MATCH - (strend - scan);
        if (s.match_length > s.lookahead) {
          s.match_length = s.lookahead;
        }
      }
    }
    if (s.match_length >= MIN_MATCH) {
      bflush = _tr_tally(s, 1, s.match_length - MIN_MATCH);
      s.lookahead -= s.match_length;
      s.strstart += s.match_length;
      s.match_length = 0;
    } else {
      bflush = _tr_tally(s, 0, s.window[s.strstart]);
      s.lookahead--;
      s.strstart++;
    }
    if (bflush) {
      flush_block_only(s, false);
      if (s.strm.avail_out === 0) {
        return BS_NEED_MORE;
      }
    }
  }
  s.insert = 0;
  if (flush === Z_FINISH$3) {
    flush_block_only(s, true);
    if (s.strm.avail_out === 0) {
      return BS_FINISH_STARTED;
    }
    return BS_FINISH_DONE;
  }
  if (s.sym_next) {
    flush_block_only(s, false);
    if (s.strm.avail_out === 0) {
      return BS_NEED_MORE;
    }
  }
  return BS_BLOCK_DONE;
};
var deflate_huff = (s, flush) => {
  let bflush;
  for (; ; ) {
    if (s.lookahead === 0) {
      fill_window(s);
      if (s.lookahead === 0) {
        if (flush === Z_NO_FLUSH$2) {
          return BS_NEED_MORE;
        }
        break;
      }
    }
    s.match_length = 0;
    bflush = _tr_tally(s, 0, s.window[s.strstart]);
    s.lookahead--;
    s.strstart++;
    if (bflush) {
      flush_block_only(s, false);
      if (s.strm.avail_out === 0) {
        return BS_NEED_MORE;
      }
    }
  }
  s.insert = 0;
  if (flush === Z_FINISH$3) {
    flush_block_only(s, true);
    if (s.strm.avail_out === 0) {
      return BS_FINISH_STARTED;
    }
    return BS_FINISH_DONE;
  }
  if (s.sym_next) {
    flush_block_only(s, false);
    if (s.strm.avail_out === 0) {
      return BS_NEED_MORE;
    }
  }
  return BS_BLOCK_DONE;
};
function Config(good_length, max_lazy, nice_length, max_chain, func) {
  this.good_length = good_length;
  this.max_lazy = max_lazy;
  this.nice_length = nice_length;
  this.max_chain = max_chain;
  this.func = func;
}
var configuration_table = [
  /*      good lazy nice chain */
  new Config(0, 0, 0, 0, deflate_stored),
  /* 0 store only */
  new Config(4, 4, 8, 4, deflate_fast),
  /* 1 max speed, no lazy matches */
  new Config(4, 5, 16, 8, deflate_fast),
  /* 2 */
  new Config(4, 6, 32, 32, deflate_fast),
  /* 3 */
  new Config(4, 4, 16, 16, deflate_slow),
  /* 4 lazy matches */
  new Config(8, 16, 32, 32, deflate_slow),
  /* 5 */
  new Config(8, 16, 128, 128, deflate_slow),
  /* 6 */
  new Config(8, 32, 128, 256, deflate_slow),
  /* 7 */
  new Config(32, 128, 258, 1024, deflate_slow),
  /* 8 */
  new Config(32, 258, 258, 4096, deflate_slow)
  /* 9 max compression */
];
var lm_init = (s) => {
  s.window_size = 2 * s.w_size;
  zero(s.head);
  s.max_lazy_match = configuration_table[s.level].max_lazy;
  s.good_match = configuration_table[s.level].good_length;
  s.nice_match = configuration_table[s.level].nice_length;
  s.max_chain_length = configuration_table[s.level].max_chain;
  s.strstart = 0;
  s.block_start = 0;
  s.lookahead = 0;
  s.insert = 0;
  s.match_length = s.prev_length = MIN_MATCH - 1;
  s.match_available = 0;
  s.ins_h = 0;
};
function DeflateState() {
  this.strm = null;
  this.status = 0;
  this.pending_buf = null;
  this.pending_buf_size = 0;
  this.pending_out = 0;
  this.pending = 0;
  this.wrap = 0;
  this.gzhead = null;
  this.gzindex = 0;
  this.method = Z_DEFLATED$2;
  this.last_flush = -1;
  this.w_size = 0;
  this.w_bits = 0;
  this.w_mask = 0;
  this.window = null;
  this.window_size = 0;
  this.prev = null;
  this.head = null;
  this.ins_h = 0;
  this.legacy_hash = 0;
  this.hash_size = 0;
  this.hash_bits = 0;
  this.hash_mask = 0;
  this.hash_shift = 0;
  this.block_start = 0;
  this.match_length = 0;
  this.prev_match = 0;
  this.match_available = 0;
  this.strstart = 0;
  this.match_start = 0;
  this.lookahead = 0;
  this.prev_length = 0;
  this.max_chain_length = 0;
  this.max_lazy_match = 0;
  this.level = 0;
  this.strategy = 0;
  this.good_match = 0;
  this.nice_match = 0;
  this.dyn_ltree = new Uint16Array(HEAP_SIZE * 2);
  this.dyn_dtree = new Uint16Array((2 * D_CODES + 1) * 2);
  this.bl_tree = new Uint16Array((2 * BL_CODES + 1) * 2);
  zero(this.dyn_ltree);
  zero(this.dyn_dtree);
  zero(this.bl_tree);
  this.l_desc = null;
  this.d_desc = null;
  this.bl_desc = null;
  this.bl_count = new Uint16Array(MAX_BITS + 1);
  this.heap = new Uint16Array(2 * L_CODES + 1);
  zero(this.heap);
  this.heap_len = 0;
  this.heap_max = 0;
  this.depth = new Uint16Array(2 * L_CODES + 1);
  zero(this.depth);
  this.sym_buf = 0;
  this.lit_bufsize = 0;
  this.sym_next = 0;
  this.sym_end = 0;
  this.opt_len = 0;
  this.static_len = 0;
  this.matches = 0;
  this.insert = 0;
  this.bi_buf = 0;
  this.bi_valid = 0;
}
var deflateStateCheck = (strm) => {
  if (!strm) {
    return 1;
  }
  const s = strm.state;
  if (!s || s.strm !== strm || s.status !== INIT_STATE && //#ifdef GZIP
  s.status !== GZIP_STATE && //#endif
  s.status !== EXTRA_STATE && s.status !== NAME_STATE && s.status !== COMMENT_STATE && s.status !== HCRC_STATE && s.status !== BUSY_STATE && s.status !== FINISH_STATE) {
    return 1;
  }
  return 0;
};
var deflateResetKeep = (strm) => {
  if (deflateStateCheck(strm)) {
    return err(strm, Z_STREAM_ERROR$2);
  }
  strm.total_in = strm.total_out = 0;
  strm.data_type = Z_UNKNOWN;
  const s = strm.state;
  s.pending = 0;
  s.pending_out = 0;
  if (s.wrap < 0) {
    s.wrap = -s.wrap;
  }
  s.status = //#ifdef GZIP
  s.wrap === 2 ? GZIP_STATE : (
    //#endif
    s.wrap ? INIT_STATE : BUSY_STATE
  );
  strm.adler = s.wrap === 2 ? 0 : 1;
  s.last_flush = -2;
  _tr_init(s);
  return Z_OK$3;
};
var deflateReset = (strm) => {
  const ret = deflateResetKeep(strm);
  if (ret === Z_OK$3) {
    lm_init(strm.state);
  }
  return ret;
};
var deflateSetHeader = (strm, head) => {
  if (deflateStateCheck(strm) || strm.state.wrap !== 2) {
    return Z_STREAM_ERROR$2;
  }
  strm.state.gzhead = head;
  return Z_OK$3;
};
var deflateInit2 = (strm, level, method, windowBits, memLevel, strategy, legacyHash) => {
  if (!strm) {
    return Z_STREAM_ERROR$2;
  }
  let wrap = 1;
  if (level === Z_DEFAULT_COMPRESSION$1) {
    level = 6;
  }
  if (windowBits < 0) {
    wrap = 0;
    windowBits = -windowBits;
  } else if (windowBits > 15) {
    wrap = 2;
    windowBits -= 16;
  }
  if (memLevel < 1 || memLevel > MAX_MEM_LEVEL || method !== Z_DEFLATED$2 || windowBits < 8 || windowBits > 15 || level < 0 || level > 9 || strategy < 0 || strategy > Z_FIXED || windowBits === 8 && wrap !== 1) {
    return err(strm, Z_STREAM_ERROR$2);
  }
  if (windowBits === 8) {
    windowBits = 9;
  }
  const s = new DeflateState();
  strm.state = s;
  s.strm = strm;
  s.status = INIT_STATE;
  s.wrap = wrap;
  s.gzhead = null;
  s.w_bits = windowBits;
  s.w_size = 1 << s.w_bits;
  s.w_mask = s.w_size - 1;
  s.legacy_hash = legacyHash ? 1 : 0;
  s.hash_bits = memLevel + 7;
  if (!s.legacy_hash && s.hash_bits < 15) {
    s.hash_bits = 15;
  }
  s.hash_size = 1 << s.hash_bits;
  s.hash_mask = s.hash_size - 1;
  s.hash_shift = ~~((s.hash_bits + MIN_MATCH - 1) / MIN_MATCH);
  s.window = new Uint8Array(s.w_size * 2);
  s.head = new Uint16Array(s.hash_size);
  s.prev = new Uint16Array(s.w_size);
  s.lit_bufsize = 1 << memLevel + 6;
  s.pending_buf_size = s.lit_bufsize * 4;
  s.pending_buf = new Uint8Array(s.pending_buf_size);
  s.sym_buf = s.lit_bufsize;
  s.sym_end = (s.lit_bufsize - 1) * 3;
  s.level = level;
  s.strategy = strategy;
  s.method = method;
  return deflateReset(strm);
};
var deflateInit = (strm, level) => {
  return deflateInit2(strm, level, Z_DEFLATED$2, MAX_WBITS$1, DEF_MEM_LEVEL, Z_DEFAULT_STRATEGY$1);
};
var deflate$2 = (strm, flush) => {
  if (deflateStateCheck(strm) || flush > Z_BLOCK$1 || flush < 0) {
    return strm ? err(strm, Z_STREAM_ERROR$2) : Z_STREAM_ERROR$2;
  }
  const s = strm.state;
  if (!strm.output || strm.avail_in !== 0 && !strm.input || s.status === FINISH_STATE && flush !== Z_FINISH$3) {
    return err(strm, strm.avail_out === 0 ? Z_BUF_ERROR$2 : Z_STREAM_ERROR$2);
  }
  const old_flush = s.last_flush;
  s.last_flush = flush;
  if (s.pending !== 0) {
    flush_pending(strm);
    if (strm.avail_out === 0) {
      s.last_flush = -1;
      return Z_OK$3;
    }
  } else if (strm.avail_in === 0 && rank(flush) <= rank(old_flush) && flush !== Z_FINISH$3) {
    return err(strm, Z_BUF_ERROR$2);
  }
  if (s.status === FINISH_STATE && strm.avail_in !== 0) {
    return err(strm, Z_BUF_ERROR$2);
  }
  if (s.status === INIT_STATE && s.wrap === 0) {
    s.status = BUSY_STATE;
  }
  if (s.status === INIT_STATE) {
    let header = Z_DEFLATED$2 + (s.w_bits - 8 << 4) << 8;
    let level_flags = -1;
    if (s.strategy >= Z_HUFFMAN_ONLY || s.level < 2) {
      level_flags = 0;
    } else if (s.level < 6) {
      level_flags = 1;
    } else if (s.level === 6) {
      level_flags = 2;
    } else {
      level_flags = 3;
    }
    header |= level_flags << 6;
    if (s.strstart !== 0) {
      header |= PRESET_DICT;
    }
    header += 31 - header % 31;
    putShortMSB(s, header);
    if (s.strstart !== 0) {
      putShortMSB(s, strm.adler >>> 16);
      putShortMSB(s, strm.adler & 65535);
    }
    strm.adler = 1;
    s.status = BUSY_STATE;
    flush_pending(strm);
    if (s.pending !== 0) {
      s.last_flush = -1;
      return Z_OK$3;
    }
  }
  if (s.status === GZIP_STATE) {
    strm.adler = 0;
    put_byte(s, 31);
    put_byte(s, 139);
    put_byte(s, 8);
    if (!s.gzhead) {
      put_byte(s, 0);
      put_byte(s, 0);
      put_byte(s, 0);
      put_byte(s, 0);
      put_byte(s, 0);
      put_byte(s, s.level === 9 ? 2 : s.strategy >= Z_HUFFMAN_ONLY || s.level < 2 ? 4 : 0);
      put_byte(s, OS_CODE);
      s.status = BUSY_STATE;
      flush_pending(strm);
      if (s.pending !== 0) {
        s.last_flush = -1;
        return Z_OK$3;
      }
    } else {
      put_byte(
        s,
        (s.gzhead.text ? 1 : 0) + (s.gzhead.hcrc ? 2 : 0) + (!s.gzhead.extra ? 0 : 4) + (!s.gzhead.name ? 0 : 8) + (!s.gzhead.comment ? 0 : 16)
      );
      put_byte(s, s.gzhead.time & 255);
      put_byte(s, s.gzhead.time >> 8 & 255);
      put_byte(s, s.gzhead.time >> 16 & 255);
      put_byte(s, s.gzhead.time >> 24 & 255);
      put_byte(s, s.level === 9 ? 2 : s.strategy >= Z_HUFFMAN_ONLY || s.level < 2 ? 4 : 0);
      put_byte(s, s.gzhead.os & 255);
      if (s.gzhead.extra && s.gzhead.extra.length) {
        put_byte(s, s.gzhead.extra.length & 255);
        put_byte(s, s.gzhead.extra.length >> 8 & 255);
      }
      if (s.gzhead.hcrc) {
        strm.adler = crc32_1(strm.adler, s.pending_buf, s.pending, 0);
      }
      s.gzindex = 0;
      s.status = EXTRA_STATE;
    }
  }
  if (s.status === EXTRA_STATE) {
    if (s.gzhead.extra) {
      let beg = s.pending;
      let left = (s.gzhead.extra.length & 65535) - s.gzindex;
      while (s.pending + left > s.pending_buf_size) {
        let copy = s.pending_buf_size - s.pending;
        s.pending_buf.set(s.gzhead.extra.subarray(s.gzindex, s.gzindex + copy), s.pending);
        s.pending = s.pending_buf_size;
        if (s.gzhead.hcrc && s.pending > beg) {
          strm.adler = crc32_1(strm.adler, s.pending_buf, s.pending - beg, beg);
        }
        s.gzindex += copy;
        flush_pending(strm);
        if (s.pending !== 0) {
          s.last_flush = -1;
          return Z_OK$3;
        }
        beg = 0;
        left -= copy;
      }
      let gzhead_extra = new Uint8Array(s.gzhead.extra);
      s.pending_buf.set(gzhead_extra.subarray(s.gzindex, s.gzindex + left), s.pending);
      s.pending += left;
      if (s.gzhead.hcrc && s.pending > beg) {
        strm.adler = crc32_1(strm.adler, s.pending_buf, s.pending - beg, beg);
      }
      s.gzindex = 0;
    }
    s.status = NAME_STATE;
  }
  if (s.status === NAME_STATE) {
    if (s.gzhead.name) {
      let beg = s.pending;
      let val;
      do {
        if (s.pending === s.pending_buf_size) {
          if (s.gzhead.hcrc && s.pending > beg) {
            strm.adler = crc32_1(strm.adler, s.pending_buf, s.pending - beg, beg);
          }
          flush_pending(strm);
          if (s.pending !== 0) {
            s.last_flush = -1;
            return Z_OK$3;
          }
          beg = 0;
        }
        if (s.gzindex < s.gzhead.name.length) {
          val = s.gzhead.name.charCodeAt(s.gzindex++) & 255;
        } else {
          val = 0;
        }
        put_byte(s, val);
      } while (val !== 0);
      if (s.gzhead.hcrc && s.pending > beg) {
        strm.adler = crc32_1(strm.adler, s.pending_buf, s.pending - beg, beg);
      }
      s.gzindex = 0;
    }
    s.status = COMMENT_STATE;
  }
  if (s.status === COMMENT_STATE) {
    if (s.gzhead.comment) {
      let beg = s.pending;
      let val;
      do {
        if (s.pending === s.pending_buf_size) {
          if (s.gzhead.hcrc && s.pending > beg) {
            strm.adler = crc32_1(strm.adler, s.pending_buf, s.pending - beg, beg);
          }
          flush_pending(strm);
          if (s.pending !== 0) {
            s.last_flush = -1;
            return Z_OK$3;
          }
          beg = 0;
        }
        if (s.gzindex < s.gzhead.comment.length) {
          val = s.gzhead.comment.charCodeAt(s.gzindex++) & 255;
        } else {
          val = 0;
        }
        put_byte(s, val);
      } while (val !== 0);
      if (s.gzhead.hcrc && s.pending > beg) {
        strm.adler = crc32_1(strm.adler, s.pending_buf, s.pending - beg, beg);
      }
    }
    s.status = HCRC_STATE;
  }
  if (s.status === HCRC_STATE) {
    if (s.gzhead.hcrc) {
      if (s.pending + 2 > s.pending_buf_size) {
        flush_pending(strm);
        if (s.pending !== 0) {
          s.last_flush = -1;
          return Z_OK$3;
        }
      }
      put_byte(s, strm.adler & 255);
      put_byte(s, strm.adler >> 8 & 255);
      strm.adler = 0;
    }
    s.status = BUSY_STATE;
    flush_pending(strm);
    if (s.pending !== 0) {
      s.last_flush = -1;
      return Z_OK$3;
    }
  }
  if (strm.avail_in !== 0 || s.lookahead !== 0 || flush !== Z_NO_FLUSH$2 && s.status !== FINISH_STATE) {
    let bstate = s.level === 0 ? deflate_stored(s, flush) : s.strategy === Z_HUFFMAN_ONLY ? deflate_huff(s, flush) : s.strategy === Z_RLE ? deflate_rle(s, flush) : configuration_table[s.level].func(s, flush);
    if (bstate === BS_FINISH_STARTED || bstate === BS_FINISH_DONE) {
      s.status = FINISH_STATE;
    }
    if (bstate === BS_NEED_MORE || bstate === BS_FINISH_STARTED) {
      if (strm.avail_out === 0) {
        s.last_flush = -1;
      }
      return Z_OK$3;
    }
    if (bstate === BS_BLOCK_DONE) {
      if (flush === Z_PARTIAL_FLUSH) {
        _tr_align(s);
      } else if (flush !== Z_BLOCK$1) {
        _tr_stored_block(s, 0, 0, false);
        if (flush === Z_FULL_FLUSH$1) {
          zero(s.head);
          if (s.lookahead === 0) {
            s.strstart = 0;
            s.block_start = 0;
            s.insert = 0;
          }
        }
      }
      flush_pending(strm);
      if (strm.avail_out === 0) {
        s.last_flush = -1;
        return Z_OK$3;
      }
    }
  }
  if (flush !== Z_FINISH$3) {
    return Z_OK$3;
  }
  if (s.wrap <= 0) {
    return Z_STREAM_END$3;
  }
  if (s.wrap === 2) {
    put_byte(s, strm.adler & 255);
    put_byte(s, strm.adler >> 8 & 255);
    put_byte(s, strm.adler >> 16 & 255);
    put_byte(s, strm.adler >> 24 & 255);
    put_byte(s, strm.total_in & 255);
    put_byte(s, strm.total_in >> 8 & 255);
    put_byte(s, strm.total_in >> 16 & 255);
    put_byte(s, strm.total_in >> 24 & 255);
  } else {
    putShortMSB(s, strm.adler >>> 16);
    putShortMSB(s, strm.adler & 65535);
  }
  flush_pending(strm);
  if (s.wrap > 0) {
    s.wrap = -s.wrap;
  }
  return s.pending !== 0 ? Z_OK$3 : Z_STREAM_END$3;
};
var deflateEnd = (strm) => {
  if (deflateStateCheck(strm)) {
    return Z_STREAM_ERROR$2;
  }
  const status = strm.state.status;
  strm.state = null;
  return status === BUSY_STATE ? err(strm, Z_DATA_ERROR$2) : Z_OK$3;
};
var deflateSetDictionary = (strm, dictionary) => {
  let dictLength = dictionary.length;
  if (deflateStateCheck(strm)) {
    return Z_STREAM_ERROR$2;
  }
  const s = strm.state;
  const wrap = s.wrap;
  if (wrap === 2 || wrap === 1 && s.status !== INIT_STATE || s.lookahead) {
    return Z_STREAM_ERROR$2;
  }
  if (wrap === 1) {
    strm.adler = adler32_1(strm.adler, dictionary, dictLength, 0);
  }
  s.wrap = 0;
  if (dictLength >= s.w_size) {
    if (wrap === 0) {
      zero(s.head);
      s.strstart = 0;
      s.block_start = 0;
      s.insert = 0;
    }
    let tmpDict = new Uint8Array(s.w_size);
    tmpDict.set(dictionary.subarray(dictLength - s.w_size, dictLength), 0);
    dictionary = tmpDict;
    dictLength = s.w_size;
  }
  const avail = strm.avail_in;
  const next = strm.next_in;
  const input = strm.input;
  strm.avail_in = dictLength;
  strm.next_in = 0;
  strm.input = dictionary;
  fill_window(s);
  while (s.lookahead >= MIN_MATCH) {
    let str = s.strstart;
    let n = s.lookahead - (MIN_MATCH - 1);
    do {
      INSERT_STRING(s, str);
      str++;
    } while (--n);
    s.strstart = str;
    s.lookahead = MIN_MATCH - 1;
    fill_window(s);
  }
  s.strstart += s.lookahead;
  s.block_start = s.strstart;
  s.insert = s.lookahead;
  s.lookahead = 0;
  s.match_length = s.prev_length = MIN_MATCH - 1;
  s.match_available = 0;
  strm.next_in = next;
  strm.input = input;
  strm.avail_in = avail;
  s.wrap = wrap;
  return Z_OK$3;
};
var deflateInit_1 = deflateInit;
var deflateInit2_1 = deflateInit2;
var deflateReset_1 = deflateReset;
var deflateResetKeep_1 = deflateResetKeep;
var deflateSetHeader_1 = deflateSetHeader;
var deflate_2$1 = deflate$2;
var deflateEnd_1 = deflateEnd;
var deflateSetDictionary_1 = deflateSetDictionary;
var deflateInfo = "pako deflate (from Nodeca project)";
var deflate_1$2 = {
  deflateInit: deflateInit_1,
  deflateInit2: deflateInit2_1,
  deflateReset: deflateReset_1,
  deflateResetKeep: deflateResetKeep_1,
  deflateSetHeader: deflateSetHeader_1,
  deflate: deflate_2$1,
  deflateEnd: deflateEnd_1,
  deflateSetDictionary: deflateSetDictionary_1,
  deflateInfo
};
var _has = (obj, key3) => {
  return Object.prototype.hasOwnProperty.call(obj, key3);
};
var assign = function(obj) {
  const sources = Array.prototype.slice.call(arguments, 1);
  while (sources.length) {
    const source = sources.shift();
    if (!source) {
      continue;
    }
    if (typeof source !== "object") {
      throw new TypeError(source + "must be non-object");
    }
    for (const p in source) {
      if (_has(source, p)) {
        obj[p] = source[p];
      }
    }
  }
  return obj;
};
var flattenChunks = (chunks) => {
  let len = 0;
  for (let i = 0, l = chunks.length; i < l; i++) {
    len += chunks[i].length;
  }
  const result = new Uint8Array(len);
  for (let i = 0, pos = 0, l = chunks.length; i < l; i++) {
    let chunk = chunks[i];
    result.set(chunk, pos);
    pos += chunk.length;
  }
  return result;
};
var common = {
  assign,
  flattenChunks
};
var STR_APPLY_UIA_OK = true;
try {
  String.fromCharCode.apply(null, new Uint8Array(1));
} catch (__) {
  STR_APPLY_UIA_OK = false;
}
var _utf8len = new Uint8Array(256);
for (let q = 0; q < 256; q++) {
  _utf8len[q] = q >= 252 ? 6 : q >= 248 ? 5 : q >= 240 ? 4 : q >= 224 ? 3 : q >= 192 ? 2 : 1;
}
_utf8len[254] = _utf8len[255] = 1;
var string2buf = (str) => {
  if (typeof TextEncoder === "function" && TextEncoder.prototype.encode) {
    return new TextEncoder().encode(str);
  }
  let buf, c, c2, m_pos, i, str_len = str.length, buf_len = 0;
  for (m_pos = 0; m_pos < str_len; m_pos++) {
    c = str.charCodeAt(m_pos);
    if ((c & 64512) === 55296 && m_pos + 1 < str_len) {
      c2 = str.charCodeAt(m_pos + 1);
      if ((c2 & 64512) === 56320) {
        c = 65536 + (c - 55296 << 10) + (c2 - 56320);
        m_pos++;
      }
    }
    buf_len += c < 128 ? 1 : c < 2048 ? 2 : c < 65536 ? 3 : 4;
  }
  buf = new Uint8Array(buf_len);
  for (i = 0, m_pos = 0; i < buf_len; m_pos++) {
    c = str.charCodeAt(m_pos);
    if ((c & 64512) === 55296 && m_pos + 1 < str_len) {
      c2 = str.charCodeAt(m_pos + 1);
      if ((c2 & 64512) === 56320) {
        c = 65536 + (c - 55296 << 10) + (c2 - 56320);
        m_pos++;
      }
    }
    if (c < 128) {
      buf[i++] = c;
    } else if (c < 2048) {
      buf[i++] = 192 | c >>> 6;
      buf[i++] = 128 | c & 63;
    } else if (c < 65536) {
      buf[i++] = 224 | c >>> 12;
      buf[i++] = 128 | c >>> 6 & 63;
      buf[i++] = 128 | c & 63;
    } else {
      buf[i++] = 240 | c >>> 18;
      buf[i++] = 128 | c >>> 12 & 63;
      buf[i++] = 128 | c >>> 6 & 63;
      buf[i++] = 128 | c & 63;
    }
  }
  return buf;
};
var buf2binstring = (buf, len) => {
  if (len < 65534) {
    if (buf.subarray && STR_APPLY_UIA_OK) {
      return String.fromCharCode.apply(null, buf.length === len ? buf : buf.subarray(0, len));
    }
  }
  let result = "";
  for (let i = 0; i < len; i++) {
    result += String.fromCharCode(buf[i]);
  }
  return result;
};
var buf2string = (buf, max) => {
  const len = max || buf.length;
  if (typeof TextDecoder === "function" && TextDecoder.prototype.decode) {
    return new TextDecoder().decode(buf.subarray(0, max));
  }
  let i, out;
  const utf16buf = new Array(len * 2);
  for (out = 0, i = 0; i < len; ) {
    let c = buf[i++];
    if (c < 128) {
      utf16buf[out++] = c;
      continue;
    }
    let c_len = _utf8len[c];
    if (c_len > 4) {
      utf16buf[out++] = 65533;
      i += c_len - 1;
      continue;
    }
    c &= c_len === 2 ? 31 : c_len === 3 ? 15 : 7;
    while (c_len > 1 && i < len) {
      c = c << 6 | buf[i++] & 63;
      c_len--;
    }
    if (c_len > 1) {
      utf16buf[out++] = 65533;
      continue;
    }
    if (c < 65536) {
      utf16buf[out++] = c;
    } else {
      c -= 65536;
      utf16buf[out++] = 55296 | c >> 10 & 1023;
      utf16buf[out++] = 56320 | c & 1023;
    }
  }
  return buf2binstring(utf16buf, out);
};
var utf8border = (buf, max) => {
  max = max || buf.length;
  if (max > buf.length) {
    max = buf.length;
  }
  let pos = max - 1;
  while (pos >= 0 && (buf[pos] & 192) === 128) {
    pos--;
  }
  if (pos < 0) {
    return max;
  }
  if (pos === 0) {
    return max;
  }
  return pos + _utf8len[buf[pos]] > max ? pos : max;
};
var strings = {
  string2buf,
  buf2string,
  utf8border
};
function ZStream() {
  this.input = null;
  this.next_in = 0;
  this.avail_in = 0;
  this.total_in = 0;
  this.output = null;
  this.next_out = 0;
  this.avail_out = 0;
  this.total_out = 0;
  this.msg = "";
  this.state = null;
  this.data_type = 2;
  this.adler = 0;
}
var zstream = ZStream;
var toString$1 = Object.prototype.toString;
var {
  Z_NO_FLUSH: Z_NO_FLUSH$1,
  Z_SYNC_FLUSH,
  Z_FULL_FLUSH,
  Z_FINISH: Z_FINISH$2,
  Z_OK: Z_OK$2,
  Z_STREAM_END: Z_STREAM_END$2,
  Z_DEFAULT_COMPRESSION,
  Z_DEFAULT_STRATEGY,
  Z_DEFLATED: Z_DEFLATED$1
} = constants$2;
var defaultOptions$1 = {
  level: Z_DEFAULT_COMPRESSION,
  method: Z_DEFLATED$1,
  chunkSize: 16384,
  windowBits: 15,
  memLevel: 8,
  strategy: Z_DEFAULT_STRATEGY,
  legacyHash: true
};
function Deflate$1(options) {
  this.options = common.assign({}, defaultOptions$1, options || {});
  let opt = this.options;
  if (opt.raw && opt.windowBits > 0) {
    opt.windowBits = -opt.windowBits;
  } else if (opt.gzip && opt.windowBits > 0 && opt.windowBits < 16) {
    opt.windowBits += 16;
  }
  this.err = 0;
  this.msg = "";
  this.ended = false;
  this.chunks = [];
  this.strm = new zstream();
  this.strm.avail_out = 0;
  let status = deflate_1$2.deflateInit2(
    this.strm,
    opt.level,
    opt.method,
    opt.windowBits,
    opt.memLevel,
    opt.strategy,
    opt.legacyHash
  );
  if (status !== Z_OK$2) {
    throw new Error(messages[status]);
  }
  if (opt.header) {
    deflate_1$2.deflateSetHeader(this.strm, opt.header);
  }
  if (opt.dictionary) {
    let dict;
    if (typeof opt.dictionary === "string") {
      dict = strings.string2buf(opt.dictionary);
    } else if (toString$1.call(opt.dictionary) === "[object ArrayBuffer]") {
      dict = new Uint8Array(opt.dictionary);
    } else {
      dict = opt.dictionary;
    }
    status = deflate_1$2.deflateSetDictionary(this.strm, dict);
    if (status !== Z_OK$2) {
      throw new Error(messages[status]);
    }
    this._dict_set = true;
  }
}
Deflate$1.prototype.push = function(data, flush_mode) {
  const strm = this.strm;
  const chunkSize = this.options.chunkSize;
  let status, _flush_mode;
  if (this.ended) {
    return false;
  }
  if (flush_mode === ~~flush_mode) _flush_mode = flush_mode;
  else _flush_mode = flush_mode === true ? Z_FINISH$2 : Z_NO_FLUSH$1;
  if (typeof data === "string") {
    strm.input = strings.string2buf(data);
  } else if (toString$1.call(data) === "[object ArrayBuffer]") {
    strm.input = new Uint8Array(data);
  } else {
    strm.input = data;
  }
  strm.next_in = 0;
  strm.avail_in = strm.input.length;
  for (; ; ) {
    if (strm.avail_out === 0) {
      strm.output = new Uint8Array(chunkSize);
      strm.next_out = 0;
      strm.avail_out = chunkSize;
    }
    if ((_flush_mode === Z_SYNC_FLUSH || _flush_mode === Z_FULL_FLUSH) && strm.avail_out <= 6) {
      this.onData(strm.output.subarray(0, strm.next_out));
      strm.avail_out = 0;
      continue;
    }
    status = deflate_1$2.deflate(strm, _flush_mode);
    if (status === Z_STREAM_END$2) {
      if (strm.next_out > 0) {
        this.onData(strm.output.subarray(0, strm.next_out));
      }
      status = deflate_1$2.deflateEnd(this.strm);
      this.onEnd(status);
      this.ended = true;
      return status === Z_OK$2;
    }
    if (strm.avail_out === 0) {
      this.onData(strm.output);
      continue;
    }
    if (_flush_mode > 0 && strm.next_out > 0) {
      this.onData(strm.output.subarray(0, strm.next_out));
      strm.avail_out = 0;
      continue;
    }
    if (strm.avail_in === 0) break;
  }
  return true;
};
Deflate$1.prototype.onData = function(chunk) {
  this.chunks.push(chunk);
};
Deflate$1.prototype.onEnd = function(status) {
  if (status === Z_OK$2) {
    this.result = common.flattenChunks(this.chunks);
  }
  this.chunks = [];
  this.err = status;
  this.msg = this.strm.msg;
};
function deflate$1(input, options) {
  const deflator = new Deflate$1(options);
  deflator.push(input, true);
  if (deflator.err) {
    throw deflator.msg || messages[deflator.err];
  }
  return deflator.result;
}
function deflateRaw$1(input, options) {
  options = options || {};
  options.raw = true;
  return deflate$1(input, options);
}
function gzip$1(input, options) {
  options = options || {};
  options.gzip = true;
  return deflate$1(input, options);
}
var Deflate_1$1 = Deflate$1;
var deflate_2 = deflate$1;
var deflateRaw_1$1 = deflateRaw$1;
var gzip_1$1 = gzip$1;
var constants$1 = constants$2;
var deflate_1$1 = {
  Deflate: Deflate_1$1,
  deflate: deflate_2,
  deflateRaw: deflateRaw_1$1,
  gzip: gzip_1$1,
  constants: constants$1
};
var BAD$1 = 16209;
var TYPE$1 = 16191;
var inffast = function inflate_fast(strm, start) {
  let _in;
  let last;
  let _out;
  let beg;
  let end;
  let dmax;
  let wsize;
  let whave;
  let wnext;
  let s_window;
  let hold;
  let bits;
  let lcode;
  let dcode;
  let lmask;
  let dmask;
  let here;
  let op;
  let len;
  let dist;
  let from;
  let from_source;
  let input, output;
  const state = strm.state;
  _in = strm.next_in;
  input = strm.input;
  last = _in + (strm.avail_in - 5);
  _out = strm.next_out;
  output = strm.output;
  beg = _out - (start - strm.avail_out);
  end = _out + (strm.avail_out - 257);
  dmax = state.dmax;
  wsize = state.wsize;
  whave = state.whave;
  wnext = state.wnext;
  s_window = state.window;
  hold = state.hold;
  bits = state.bits;
  lcode = state.lencode;
  dcode = state.distcode;
  lmask = (1 << state.lenbits) - 1;
  dmask = (1 << state.distbits) - 1;
  top:
    do {
      if (bits < 15) {
        hold += input[_in++] << bits;
        bits += 8;
        hold += input[_in++] << bits;
        bits += 8;
      }
      here = lcode[hold & lmask];
      dolen:
        for (; ; ) {
          op = here >>> 24;
          hold >>>= op;
          bits -= op;
          op = here >>> 16 & 255;
          if (op === 0) {
            output[_out++] = here & 65535;
          } else if (op & 16) {
            len = here & 65535;
            op &= 15;
            if (op) {
              if (bits < op) {
                hold += input[_in++] << bits;
                bits += 8;
              }
              len += hold & (1 << op) - 1;
              hold >>>= op;
              bits -= op;
            }
            if (bits < 15) {
              hold += input[_in++] << bits;
              bits += 8;
              hold += input[_in++] << bits;
              bits += 8;
            }
            here = dcode[hold & dmask];
            dodist:
              for (; ; ) {
                op = here >>> 24;
                hold >>>= op;
                bits -= op;
                op = here >>> 16 & 255;
                if (op & 16) {
                  dist = here & 65535;
                  op &= 15;
                  if (bits < op) {
                    hold += input[_in++] << bits;
                    bits += 8;
                    if (bits < op) {
                      hold += input[_in++] << bits;
                      bits += 8;
                    }
                  }
                  dist += hold & (1 << op) - 1;
                  if (dist > dmax) {
                    strm.msg = "invalid distance too far back";
                    state.mode = BAD$1;
                    break top;
                  }
                  hold >>>= op;
                  bits -= op;
                  op = _out - beg;
                  if (dist > op) {
                    op = dist - op;
                    if (op > whave) {
                      if (state.sane) {
                        strm.msg = "invalid distance too far back";
                        state.mode = BAD$1;
                        break top;
                      }
                    }
                    from = 0;
                    from_source = s_window;
                    if (wnext === 0) {
                      from += wsize - op;
                      if (op < len) {
                        len -= op;
                        do {
                          output[_out++] = s_window[from++];
                        } while (--op);
                        from = _out - dist;
                        from_source = output;
                      }
                    } else if (wnext < op) {
                      from += wsize + wnext - op;
                      op -= wnext;
                      if (op < len) {
                        len -= op;
                        do {
                          output[_out++] = s_window[from++];
                        } while (--op);
                        from = 0;
                        if (wnext < len) {
                          op = wnext;
                          len -= op;
                          do {
                            output[_out++] = s_window[from++];
                          } while (--op);
                          from = _out - dist;
                          from_source = output;
                        }
                      }
                    } else {
                      from += wnext - op;
                      if (op < len) {
                        len -= op;
                        do {
                          output[_out++] = s_window[from++];
                        } while (--op);
                        from = _out - dist;
                        from_source = output;
                      }
                    }
                    while (len > 2) {
                      output[_out++] = from_source[from++];
                      output[_out++] = from_source[from++];
                      output[_out++] = from_source[from++];
                      len -= 3;
                    }
                    if (len) {
                      output[_out++] = from_source[from++];
                      if (len > 1) {
                        output[_out++] = from_source[from++];
                      }
                    }
                  } else {
                    from = _out - dist;
                    do {
                      output[_out++] = output[from++];
                      output[_out++] = output[from++];
                      output[_out++] = output[from++];
                      len -= 3;
                    } while (len > 2);
                    if (len) {
                      output[_out++] = output[from++];
                      if (len > 1) {
                        output[_out++] = output[from++];
                      }
                    }
                  }
                } else if ((op & 64) === 0) {
                  here = dcode[(here & 65535) + (hold & (1 << op) - 1)];
                  continue dodist;
                } else {
                  strm.msg = "invalid distance code";
                  state.mode = BAD$1;
                  break top;
                }
                break;
              }
          } else if ((op & 64) === 0) {
            here = lcode[(here & 65535) + (hold & (1 << op) - 1)];
            continue dolen;
          } else if (op & 32) {
            state.mode = TYPE$1;
            break top;
          } else {
            strm.msg = "invalid literal/length code";
            state.mode = BAD$1;
            break top;
          }
          break;
        }
    } while (_in < last && _out < end);
  len = bits >> 3;
  _in -= len;
  bits -= len << 3;
  hold &= (1 << bits) - 1;
  strm.next_in = _in;
  strm.next_out = _out;
  strm.avail_in = _in < last ? 5 + (last - _in) : 5 - (_in - last);
  strm.avail_out = _out < end ? 257 + (end - _out) : 257 - (_out - end);
  state.hold = hold;
  state.bits = bits;
  return;
};
var MAXBITS = 15;
var ENOUGH_LENS$1 = 852;
var ENOUGH_DISTS$1 = 592;
var CODES$1 = 0;
var LENS$1 = 1;
var DISTS$1 = 2;
var lbase = new Uint16Array([
  /* Length codes 257..285 base */
  3,
  4,
  5,
  6,
  7,
  8,
  9,
  10,
  11,
  13,
  15,
  17,
  19,
  23,
  27,
  31,
  35,
  43,
  51,
  59,
  67,
  83,
  99,
  115,
  131,
  163,
  195,
  227,
  258,
  0,
  0
]);
var lext = new Uint8Array([
  /* Length codes 257..285 extra */
  16,
  16,
  16,
  16,
  16,
  16,
  16,
  16,
  17,
  17,
  17,
  17,
  18,
  18,
  18,
  18,
  19,
  19,
  19,
  19,
  20,
  20,
  20,
  20,
  21,
  21,
  21,
  21,
  16,
  199,
  75
]);
var dbase = new Uint16Array([
  /* Distance codes 0..29 base */
  1,
  2,
  3,
  4,
  5,
  7,
  9,
  13,
  17,
  25,
  33,
  49,
  65,
  97,
  129,
  193,
  257,
  385,
  513,
  769,
  1025,
  1537,
  2049,
  3073,
  4097,
  6145,
  8193,
  12289,
  16385,
  24577,
  0,
  0
]);
var dext = new Uint8Array([
  /* Distance codes 0..29 extra */
  16,
  16,
  16,
  16,
  17,
  17,
  18,
  18,
  19,
  19,
  20,
  20,
  21,
  21,
  22,
  22,
  23,
  23,
  24,
  24,
  25,
  25,
  26,
  26,
  27,
  27,
  28,
  28,
  29,
  29,
  64,
  64
]);
var inflate_table = (type, lens, lens_index, codes, table2, table_index, work, opts) => {
  const bits = opts.bits;
  let len = 0;
  let sym = 0;
  let min = 0, max = 0;
  let root = 0;
  let curr = 0;
  let drop = 0;
  let left = 0;
  let used = 0;
  let huff = 0;
  let incr;
  let fill;
  let low;
  let mask;
  let next;
  let base = null;
  let match;
  const count = new Uint16Array(MAXBITS + 1);
  const offs = new Uint16Array(MAXBITS + 1);
  let extra = null;
  let here_bits, here_op, here_val;
  for (len = 0; len <= MAXBITS; len++) {
    count[len] = 0;
  }
  for (sym = 0; sym < codes; sym++) {
    count[lens[lens_index + sym]]++;
  }
  root = bits;
  for (max = MAXBITS; max >= 1; max--) {
    if (count[max] !== 0) {
      break;
    }
  }
  if (root > max) {
    root = max;
  }
  if (max === 0) {
    table2[table_index++] = 1 << 24 | 64 << 16 | 0;
    table2[table_index++] = 1 << 24 | 64 << 16 | 0;
    opts.bits = 1;
    return 0;
  }
  for (min = 1; min < max; min++) {
    if (count[min] !== 0) {
      break;
    }
  }
  if (root < min) {
    root = min;
  }
  left = 1;
  for (len = 1; len <= MAXBITS; len++) {
    left <<= 1;
    left -= count[len];
    if (left < 0) {
      return -1;
    }
  }
  if (left > 0 && (type === CODES$1 || max !== 1)) {
    return -1;
  }
  offs[1] = 0;
  for (len = 1; len < MAXBITS; len++) {
    offs[len + 1] = offs[len] + count[len];
  }
  for (sym = 0; sym < codes; sym++) {
    if (lens[lens_index + sym] !== 0) {
      work[offs[lens[lens_index + sym]]++] = sym;
    }
  }
  if (type === CODES$1) {
    base = extra = work;
    match = 20;
  } else if (type === LENS$1) {
    base = lbase;
    extra = lext;
    match = 257;
  } else {
    base = dbase;
    extra = dext;
    match = 0;
  }
  huff = 0;
  sym = 0;
  len = min;
  next = table_index;
  curr = root;
  drop = 0;
  low = -1;
  used = 1 << root;
  mask = used - 1;
  if (type === LENS$1 && used > ENOUGH_LENS$1 || type === DISTS$1 && used > ENOUGH_DISTS$1) {
    return 1;
  }
  for (; ; ) {
    here_bits = len - drop;
    if (work[sym] + 1 < match) {
      here_op = 0;
      here_val = work[sym];
    } else if (work[sym] >= match) {
      here_op = extra[work[sym] - match];
      here_val = base[work[sym] - match];
    } else {
      here_op = 32 + 64;
      here_val = 0;
    }
    incr = 1 << len - drop;
    fill = 1 << curr;
    min = fill;
    do {
      fill -= incr;
      table2[next + (huff >> drop) + fill] = here_bits << 24 | here_op << 16 | here_val | 0;
    } while (fill !== 0);
    incr = 1 << len - 1;
    while (huff & incr) {
      incr >>= 1;
    }
    if (incr !== 0) {
      huff &= incr - 1;
      huff += incr;
    } else {
      huff = 0;
    }
    sym++;
    if (--count[len] === 0) {
      if (len === max) {
        break;
      }
      len = lens[lens_index + work[sym]];
    }
    if (len > root && (huff & mask) !== low) {
      if (drop === 0) {
        drop = root;
      }
      next += min;
      curr = len - drop;
      left = 1 << curr;
      while (curr + drop < max) {
        left -= count[curr + drop];
        if (left <= 0) {
          break;
        }
        curr++;
        left <<= 1;
      }
      used += 1 << curr;
      if (type === LENS$1 && used > ENOUGH_LENS$1 || type === DISTS$1 && used > ENOUGH_DISTS$1) {
        return 1;
      }
      low = huff & mask;
      table2[low] = root << 24 | curr << 16 | next - table_index | 0;
    }
  }
  if (huff !== 0) {
    table2[next + huff] = len - drop << 24 | 64 << 16 | 0;
  }
  opts.bits = root;
  return 0;
};
var inftrees = inflate_table;
var CODES = 0;
var LENS = 1;
var DISTS = 2;
var {
  Z_FINISH: Z_FINISH$1,
  Z_BLOCK,
  Z_TREES,
  Z_OK: Z_OK$1,
  Z_STREAM_END: Z_STREAM_END$1,
  Z_NEED_DICT: Z_NEED_DICT$1,
  Z_STREAM_ERROR: Z_STREAM_ERROR$1,
  Z_DATA_ERROR: Z_DATA_ERROR$1,
  Z_MEM_ERROR: Z_MEM_ERROR$1,
  Z_BUF_ERROR: Z_BUF_ERROR$1,
  Z_DEFLATED
} = constants$2;
var HEAD = 16180;
var FLAGS = 16181;
var TIME = 16182;
var OS = 16183;
var EXLEN = 16184;
var EXTRA = 16185;
var NAME = 16186;
var COMMENT = 16187;
var HCRC = 16188;
var DICTID = 16189;
var DICT = 16190;
var TYPE = 16191;
var TYPEDO = 16192;
var STORED = 16193;
var COPY_ = 16194;
var COPY = 16195;
var TABLE = 16196;
var LENLENS = 16197;
var CODELENS = 16198;
var LEN_ = 16199;
var LEN = 16200;
var LENEXT = 16201;
var DIST = 16202;
var DISTEXT = 16203;
var MATCH = 16204;
var LIT = 16205;
var CHECK = 16206;
var LENGTH = 16207;
var DONE = 16208;
var BAD = 16209;
var MEM = 16210;
var SYNC = 16211;
var ENOUGH_LENS = 852;
var ENOUGH_DISTS = 592;
var MAX_WBITS = 15;
var DEF_WBITS = MAX_WBITS;
var zswap32 = (q) => {
  return (q >>> 24 & 255) + (q >>> 8 & 65280) + ((q & 65280) << 8) + ((q & 255) << 24);
};
function InflateState() {
  this.strm = null;
  this.mode = 0;
  this.last = false;
  this.wrap = 0;
  this.havedict = false;
  this.flags = 0;
  this.dmax = 0;
  this.check = 0;
  this.total = 0;
  this.head = null;
  this.wbits = 0;
  this.wsize = 0;
  this.whave = 0;
  this.wnext = 0;
  this.window = null;
  this.hold = 0;
  this.bits = 0;
  this.length = 0;
  this.offset = 0;
  this.extra = 0;
  this.lencode = null;
  this.distcode = null;
  this.lenbits = 0;
  this.distbits = 0;
  this.ncode = 0;
  this.nlen = 0;
  this.ndist = 0;
  this.have = 0;
  this.next = null;
  this.lens = new Uint16Array(320);
  this.work = new Uint16Array(288);
  this.lendyn = null;
  this.distdyn = null;
  this.sane = 0;
  this.back = 0;
  this.was = 0;
}
var inflateStateCheck = (strm) => {
  if (!strm) {
    return 1;
  }
  const state = strm.state;
  if (!state || state.strm !== strm || state.mode < HEAD || state.mode > SYNC) {
    return 1;
  }
  return 0;
};
var inflateResetKeep = (strm) => {
  if (inflateStateCheck(strm)) {
    return Z_STREAM_ERROR$1;
  }
  const state = strm.state;
  strm.total_in = strm.total_out = state.total = 0;
  strm.msg = "";
  if (state.wrap) {
    strm.adler = state.wrap & 1;
  }
  state.mode = HEAD;
  state.last = 0;
  state.havedict = 0;
  state.flags = -1;
  state.dmax = 32768;
  state.head = null;
  state.hold = 0;
  state.bits = 0;
  state.lencode = state.lendyn = new Int32Array(ENOUGH_LENS);
  state.distcode = state.distdyn = new Int32Array(ENOUGH_DISTS);
  state.sane = 1;
  state.back = -1;
  return Z_OK$1;
};
var inflateReset = (strm) => {
  if (inflateStateCheck(strm)) {
    return Z_STREAM_ERROR$1;
  }
  const state = strm.state;
  state.wsize = 0;
  state.whave = 0;
  state.wnext = 0;
  return inflateResetKeep(strm);
};
var inflateReset2 = (strm, windowBits) => {
  let wrap;
  if (inflateStateCheck(strm)) {
    return Z_STREAM_ERROR$1;
  }
  const state = strm.state;
  if (windowBits < 0) {
    wrap = 0;
    windowBits = -windowBits;
  } else {
    wrap = (windowBits >> 4) + 5;
    if (windowBits < 48) {
      windowBits &= 15;
    }
  }
  if (windowBits && (windowBits < 8 || windowBits > 15)) {
    return Z_STREAM_ERROR$1;
  }
  if (state.window !== null && state.wbits !== windowBits) {
    state.window = null;
  }
  state.wrap = wrap;
  state.wbits = windowBits;
  return inflateReset(strm);
};
var inflateInit2 = (strm, windowBits) => {
  if (!strm) {
    return Z_STREAM_ERROR$1;
  }
  const state = new InflateState();
  strm.state = state;
  state.strm = strm;
  state.window = null;
  state.mode = HEAD;
  const ret = inflateReset2(strm, windowBits);
  if (ret !== Z_OK$1) {
    strm.state = null;
  }
  return ret;
};
var inflateInit = (strm) => {
  return inflateInit2(strm, DEF_WBITS);
};
var virgin = true;
var lenfix;
var distfix;
var fixedtables = (state) => {
  if (virgin) {
    lenfix = new Int32Array(512);
    distfix = new Int32Array(32);
    let sym = 0;
    while (sym < 144) {
      state.lens[sym++] = 8;
    }
    while (sym < 256) {
      state.lens[sym++] = 9;
    }
    while (sym < 280) {
      state.lens[sym++] = 7;
    }
    while (sym < 288) {
      state.lens[sym++] = 8;
    }
    inftrees(LENS, state.lens, 0, 288, lenfix, 0, state.work, { bits: 9 });
    sym = 0;
    while (sym < 32) {
      state.lens[sym++] = 5;
    }
    inftrees(DISTS, state.lens, 0, 32, distfix, 0, state.work, { bits: 5 });
    virgin = false;
  }
  state.lencode = lenfix;
  state.lenbits = 9;
  state.distcode = distfix;
  state.distbits = 5;
};
var updatewindow = (strm, src, end, copy) => {
  let dist;
  const state = strm.state;
  if (state.window === null) {
    state.window = new Uint8Array(1 << state.wbits);
  }
  if (state.wsize === 0) {
    state.wsize = 1 << state.wbits;
    state.wnext = 0;
    state.whave = 0;
  }
  if (copy >= state.wsize) {
    state.window.set(src.subarray(end - state.wsize, end), 0);
    state.wnext = 0;
    state.whave = state.wsize;
  } else {
    dist = state.wsize - state.wnext;
    if (dist > copy) {
      dist = copy;
    }
    state.window.set(src.subarray(end - copy, end - copy + dist), state.wnext);
    copy -= dist;
    if (copy) {
      state.window.set(src.subarray(end - copy, end), 0);
      state.wnext = copy;
      state.whave = state.wsize;
    } else {
      state.wnext += dist;
      if (state.wnext === state.wsize) {
        state.wnext = 0;
      }
      if (state.whave < state.wsize) {
        state.whave += dist;
      }
    }
  }
  return 0;
};
var inflate$2 = (strm, flush) => {
  let state;
  let input, output;
  let next;
  let put;
  let have, left;
  let hold;
  let bits;
  let _in, _out;
  let copy;
  let from;
  let from_source;
  let here = 0;
  let here_bits, here_op, here_val;
  let last_bits, last_op, last_val;
  let len;
  let ret;
  const hbuf = new Uint8Array(4);
  let opts;
  let n;
  const order = (
    /* permutation of code lengths */
    new Uint8Array([16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15])
  );
  if (inflateStateCheck(strm) || !strm.output || !strm.input && strm.avail_in !== 0) {
    return Z_STREAM_ERROR$1;
  }
  state = strm.state;
  if (state.mode === TYPE) {
    state.mode = TYPEDO;
  }
  put = strm.next_out;
  output = strm.output;
  left = strm.avail_out;
  next = strm.next_in;
  input = strm.input;
  have = strm.avail_in;
  hold = state.hold;
  bits = state.bits;
  _in = have;
  _out = left;
  ret = Z_OK$1;
  inf_leave:
    for (; ; ) {
      switch (state.mode) {
        case HEAD:
          if (state.wrap === 0) {
            state.mode = TYPEDO;
            break;
          }
          while (bits < 16) {
            if (have === 0) {
              break inf_leave;
            }
            have--;
            hold += input[next++] << bits;
            bits += 8;
          }
          if (state.wrap & 2 && hold === 35615) {
            if (state.wbits === 0) {
              state.wbits = 15;
            }
            state.check = 0;
            hbuf[0] = hold & 255;
            hbuf[1] = hold >>> 8 & 255;
            state.check = crc32_1(state.check, hbuf, 2, 0);
            hold = 0;
            bits = 0;
            state.mode = FLAGS;
            break;
          }
          if (state.head) {
            state.head.done = false;
          }
          if (!(state.wrap & 1) || /* check if zlib header allowed */
          (((hold & 255) << 8) + (hold >> 8)) % 31) {
            strm.msg = "incorrect header check";
            state.mode = BAD;
            break;
          }
          if ((hold & 15) !== Z_DEFLATED) {
            strm.msg = "unknown compression method";
            state.mode = BAD;
            break;
          }
          hold >>>= 4;
          bits -= 4;
          len = (hold & 15) + 8;
          if (state.wbits === 0) {
            state.wbits = len;
          }
          if (len > 15 || len > state.wbits) {
            strm.msg = "invalid window size";
            state.mode = BAD;
            break;
          }
          state.dmax = 1 << state.wbits;
          state.flags = 0;
          strm.adler = state.check = 1;
          state.mode = hold & 512 ? DICTID : TYPE;
          hold = 0;
          bits = 0;
          break;
        case FLAGS:
          while (bits < 16) {
            if (have === 0) {
              break inf_leave;
            }
            have--;
            hold += input[next++] << bits;
            bits += 8;
          }
          state.flags = hold;
          if ((state.flags & 255) !== Z_DEFLATED) {
            strm.msg = "unknown compression method";
            state.mode = BAD;
            break;
          }
          if (state.flags & 57344) {
            strm.msg = "unknown header flags set";
            state.mode = BAD;
            break;
          }
          if (state.head) {
            state.head.text = hold >> 8 & 1;
          }
          if (state.flags & 512 && state.wrap & 4) {
            hbuf[0] = hold & 255;
            hbuf[1] = hold >>> 8 & 255;
            state.check = crc32_1(state.check, hbuf, 2, 0);
          }
          hold = 0;
          bits = 0;
          state.mode = TIME;
        /* falls through */
        case TIME:
          while (bits < 32) {
            if (have === 0) {
              break inf_leave;
            }
            have--;
            hold += input[next++] << bits;
            bits += 8;
          }
          if (state.head) {
            state.head.time = hold;
          }
          if (state.flags & 512 && state.wrap & 4) {
            hbuf[0] = hold & 255;
            hbuf[1] = hold >>> 8 & 255;
            hbuf[2] = hold >>> 16 & 255;
            hbuf[3] = hold >>> 24 & 255;
            state.check = crc32_1(state.check, hbuf, 4, 0);
          }
          hold = 0;
          bits = 0;
          state.mode = OS;
        /* falls through */
        case OS:
          while (bits < 16) {
            if (have === 0) {
              break inf_leave;
            }
            have--;
            hold += input[next++] << bits;
            bits += 8;
          }
          if (state.head) {
            state.head.xflags = hold & 255;
            state.head.os = hold >> 8;
          }
          if (state.flags & 512 && state.wrap & 4) {
            hbuf[0] = hold & 255;
            hbuf[1] = hold >>> 8 & 255;
            state.check = crc32_1(state.check, hbuf, 2, 0);
          }
          hold = 0;
          bits = 0;
          state.mode = EXLEN;
        /* falls through */
        case EXLEN:
          if (state.flags & 1024) {
            while (bits < 16) {
              if (have === 0) {
                break inf_leave;
              }
              have--;
              hold += input[next++] << bits;
              bits += 8;
            }
            state.length = hold;
            if (state.head) {
              state.head.extra_len = hold;
            }
            if (state.flags & 512 && state.wrap & 4) {
              hbuf[0] = hold & 255;
              hbuf[1] = hold >>> 8 & 255;
              state.check = crc32_1(state.check, hbuf, 2, 0);
            }
            hold = 0;
            bits = 0;
          } else if (state.head) {
            state.head.extra = null;
          }
          state.mode = EXTRA;
        /* falls through */
        case EXTRA:
          if (state.flags & 1024) {
            copy = state.length;
            if (copy > have) {
              copy = have;
            }
            if (copy) {
              if (state.head) {
                len = state.head.extra_len - state.length;
                if (!state.head.extra) {
                  state.head.extra = new Uint8Array(state.head.extra_len);
                }
                state.head.extra.set(
                  input.subarray(
                    next,
                    // extra field is limited to 65536 bytes
                    // - no need for additional size check
                    next + copy
                  ),
                  /*len + copy > state.head.extra_max - len ? state.head.extra_max : copy,*/
                  len
                );
              }
              if (state.flags & 512 && state.wrap & 4) {
                state.check = crc32_1(state.check, input, copy, next);
              }
              have -= copy;
              next += copy;
              state.length -= copy;
            }
            if (state.length) {
              break inf_leave;
            }
          }
          state.length = 0;
          state.mode = NAME;
        /* falls through */
        case NAME:
          if (state.flags & 2048) {
            if (have === 0) {
              break inf_leave;
            }
            copy = 0;
            do {
              len = input[next + copy++];
              if (state.head && len && state.length < 65536) {
                state.head.name += String.fromCharCode(len);
              }
            } while (len && copy < have);
            if (state.flags & 512 && state.wrap & 4) {
              state.check = crc32_1(state.check, input, copy, next);
            }
            have -= copy;
            next += copy;
            if (len) {
              break inf_leave;
            }
          } else if (state.head) {
            state.head.name = null;
          }
          state.length = 0;
          state.mode = COMMENT;
        /* falls through */
        case COMMENT:
          if (state.flags & 4096) {
            if (have === 0) {
              break inf_leave;
            }
            copy = 0;
            do {
              len = input[next + copy++];
              if (state.head && len && state.length < 65536) {
                state.head.comment += String.fromCharCode(len);
              }
            } while (len && copy < have);
            if (state.flags & 512 && state.wrap & 4) {
              state.check = crc32_1(state.check, input, copy, next);
            }
            have -= copy;
            next += copy;
            if (len) {
              break inf_leave;
            }
          } else if (state.head) {
            state.head.comment = null;
          }
          state.mode = HCRC;
        /* falls through */
        case HCRC:
          if (state.flags & 512) {
            while (bits < 16) {
              if (have === 0) {
                break inf_leave;
              }
              have--;
              hold += input[next++] << bits;
              bits += 8;
            }
            if (state.wrap & 4 && hold !== (state.check & 65535)) {
              strm.msg = "header crc mismatch";
              state.mode = BAD;
              break;
            }
            hold = 0;
            bits = 0;
          }
          if (state.head) {
            state.head.hcrc = state.flags >> 9 & 1;
            state.head.done = true;
          }
          strm.adler = state.check = 0;
          state.mode = TYPE;
          break;
        case DICTID:
          while (bits < 32) {
            if (have === 0) {
              break inf_leave;
            }
            have--;
            hold += input[next++] << bits;
            bits += 8;
          }
          strm.adler = state.check = zswap32(hold);
          hold = 0;
          bits = 0;
          state.mode = DICT;
        /* falls through */
        case DICT:
          if (state.havedict === 0) {
            strm.next_out = put;
            strm.avail_out = left;
            strm.next_in = next;
            strm.avail_in = have;
            state.hold = hold;
            state.bits = bits;
            return Z_NEED_DICT$1;
          }
          strm.adler = state.check = 1;
          state.mode = TYPE;
        /* falls through */
        case TYPE:
          if (flush === Z_BLOCK || flush === Z_TREES) {
            break inf_leave;
          }
        /* falls through */
        case TYPEDO:
          if (state.last) {
            hold >>>= bits & 7;
            bits -= bits & 7;
            state.mode = CHECK;
            break;
          }
          while (bits < 3) {
            if (have === 0) {
              break inf_leave;
            }
            have--;
            hold += input[next++] << bits;
            bits += 8;
          }
          state.last = hold & 1;
          hold >>>= 1;
          bits -= 1;
          switch (hold & 3) {
            case 0:
              state.mode = STORED;
              break;
            case 1:
              fixedtables(state);
              state.mode = LEN_;
              if (flush === Z_TREES) {
                hold >>>= 2;
                bits -= 2;
                break inf_leave;
              }
              break;
            case 2:
              state.mode = TABLE;
              break;
            case 3:
              strm.msg = "invalid block type";
              state.mode = BAD;
          }
          hold >>>= 2;
          bits -= 2;
          break;
        case STORED:
          hold >>>= bits & 7;
          bits -= bits & 7;
          while (bits < 32) {
            if (have === 0) {
              break inf_leave;
            }
            have--;
            hold += input[next++] << bits;
            bits += 8;
          }
          if ((hold & 65535) !== (hold >>> 16 ^ 65535)) {
            strm.msg = "invalid stored block lengths";
            state.mode = BAD;
            break;
          }
          state.length = hold & 65535;
          hold = 0;
          bits = 0;
          state.mode = COPY_;
          if (flush === Z_TREES) {
            break inf_leave;
          }
        /* falls through */
        case COPY_:
          state.mode = COPY;
        /* falls through */
        case COPY:
          copy = state.length;
          if (copy) {
            if (copy > have) {
              copy = have;
            }
            if (copy > left) {
              copy = left;
            }
            if (copy === 0) {
              break inf_leave;
            }
            output.set(input.subarray(next, next + copy), put);
            have -= copy;
            next += copy;
            left -= copy;
            put += copy;
            state.length -= copy;
            break;
          }
          state.mode = TYPE;
          break;
        case TABLE:
          while (bits < 14) {
            if (have === 0) {
              break inf_leave;
            }
            have--;
            hold += input[next++] << bits;
            bits += 8;
          }
          state.nlen = (hold & 31) + 257;
          hold >>>= 5;
          bits -= 5;
          state.ndist = (hold & 31) + 1;
          hold >>>= 5;
          bits -= 5;
          state.ncode = (hold & 15) + 4;
          hold >>>= 4;
          bits -= 4;
          if (state.nlen > 286 || state.ndist > 30) {
            strm.msg = "too many length or distance symbols";
            state.mode = BAD;
            break;
          }
          state.have = 0;
          state.mode = LENLENS;
        /* falls through */
        case LENLENS:
          while (state.have < state.ncode) {
            while (bits < 3) {
              if (have === 0) {
                break inf_leave;
              }
              have--;
              hold += input[next++] << bits;
              bits += 8;
            }
            state.lens[order[state.have++]] = hold & 7;
            hold >>>= 3;
            bits -= 3;
          }
          while (state.have < 19) {
            state.lens[order[state.have++]] = 0;
          }
          state.lencode = state.lendyn;
          state.lenbits = 7;
          opts = { bits: state.lenbits };
          ret = inftrees(CODES, state.lens, 0, 19, state.lencode, 0, state.work, opts);
          state.lenbits = opts.bits;
          if (ret) {
            strm.msg = "invalid code lengths set";
            state.mode = BAD;
            break;
          }
          state.have = 0;
          state.mode = CODELENS;
        /* falls through */
        case CODELENS:
          while (state.have < state.nlen + state.ndist) {
            for (; ; ) {
              here = state.lencode[hold & (1 << state.lenbits) - 1];
              here_bits = here >>> 24;
              here_op = here >>> 16 & 255;
              here_val = here & 65535;
              if (here_bits <= bits) {
                break;
              }
              if (have === 0) {
                break inf_leave;
              }
              have--;
              hold += input[next++] << bits;
              bits += 8;
            }
            if (here_val < 16) {
              hold >>>= here_bits;
              bits -= here_bits;
              state.lens[state.have++] = here_val;
            } else {
              if (here_val === 16) {
                n = here_bits + 2;
                while (bits < n) {
                  if (have === 0) {
                    break inf_leave;
                  }
                  have--;
                  hold += input[next++] << bits;
                  bits += 8;
                }
                hold >>>= here_bits;
                bits -= here_bits;
                if (state.have === 0) {
                  strm.msg = "invalid bit length repeat";
                  state.mode = BAD;
                  break;
                }
                len = state.lens[state.have - 1];
                copy = 3 + (hold & 3);
                hold >>>= 2;
                bits -= 2;
              } else if (here_val === 17) {
                n = here_bits + 3;
                while (bits < n) {
                  if (have === 0) {
                    break inf_leave;
                  }
                  have--;
                  hold += input[next++] << bits;
                  bits += 8;
                }
                hold >>>= here_bits;
                bits -= here_bits;
                len = 0;
                copy = 3 + (hold & 7);
                hold >>>= 3;
                bits -= 3;
              } else {
                n = here_bits + 7;
                while (bits < n) {
                  if (have === 0) {
                    break inf_leave;
                  }
                  have--;
                  hold += input[next++] << bits;
                  bits += 8;
                }
                hold >>>= here_bits;
                bits -= here_bits;
                len = 0;
                copy = 11 + (hold & 127);
                hold >>>= 7;
                bits -= 7;
              }
              if (state.have + copy > state.nlen + state.ndist) {
                strm.msg = "invalid bit length repeat";
                state.mode = BAD;
                break;
              }
              while (copy--) {
                state.lens[state.have++] = len;
              }
            }
          }
          if (state.mode === BAD) {
            break;
          }
          if (state.lens[256] === 0) {
            strm.msg = "invalid code -- missing end-of-block";
            state.mode = BAD;
            break;
          }
          state.lenbits = 9;
          opts = { bits: state.lenbits };
          ret = inftrees(LENS, state.lens, 0, state.nlen, state.lencode, 0, state.work, opts);
          state.lenbits = opts.bits;
          if (ret) {
            strm.msg = "invalid literal/lengths set";
            state.mode = BAD;
            break;
          }
          state.distbits = 6;
          state.distcode = state.distdyn;
          opts = { bits: state.distbits };
          ret = inftrees(DISTS, state.lens, state.nlen, state.ndist, state.distcode, 0, state.work, opts);
          state.distbits = opts.bits;
          if (ret) {
            strm.msg = "invalid distances set";
            state.mode = BAD;
            break;
          }
          state.mode = LEN_;
          if (flush === Z_TREES) {
            break inf_leave;
          }
        /* falls through */
        case LEN_:
          state.mode = LEN;
        /* falls through */
        case LEN:
          if (have >= 6 && left >= 258) {
            strm.next_out = put;
            strm.avail_out = left;
            strm.next_in = next;
            strm.avail_in = have;
            state.hold = hold;
            state.bits = bits;
            inffast(strm, _out);
            put = strm.next_out;
            output = strm.output;
            left = strm.avail_out;
            next = strm.next_in;
            input = strm.input;
            have = strm.avail_in;
            hold = state.hold;
            bits = state.bits;
            if (state.mode === TYPE) {
              state.back = -1;
            }
            break;
          }
          state.back = 0;
          for (; ; ) {
            here = state.lencode[hold & (1 << state.lenbits) - 1];
            here_bits = here >>> 24;
            here_op = here >>> 16 & 255;
            here_val = here & 65535;
            if (here_bits <= bits) {
              break;
            }
            if (have === 0) {
              break inf_leave;
            }
            have--;
            hold += input[next++] << bits;
            bits += 8;
          }
          if (here_op && (here_op & 240) === 0) {
            last_bits = here_bits;
            last_op = here_op;
            last_val = here_val;
            for (; ; ) {
              here = state.lencode[last_val + ((hold & (1 << last_bits + last_op) - 1) >> last_bits)];
              here_bits = here >>> 24;
              here_op = here >>> 16 & 255;
              here_val = here & 65535;
              if (last_bits + here_bits <= bits) {
                break;
              }
              if (have === 0) {
                break inf_leave;
              }
              have--;
              hold += input[next++] << bits;
              bits += 8;
            }
            hold >>>= last_bits;
            bits -= last_bits;
            state.back += last_bits;
          }
          hold >>>= here_bits;
          bits -= here_bits;
          state.back += here_bits;
          state.length = here_val;
          if (here_op === 0) {
            state.mode = LIT;
            break;
          }
          if (here_op & 32) {
            state.back = -1;
            state.mode = TYPE;
            break;
          }
          if (here_op & 64) {
            strm.msg = "invalid literal/length code";
            state.mode = BAD;
            break;
          }
          state.extra = here_op & 15;
          state.mode = LENEXT;
        /* falls through */
        case LENEXT:
          if (state.extra) {
            n = state.extra;
            while (bits < n) {
              if (have === 0) {
                break inf_leave;
              }
              have--;
              hold += input[next++] << bits;
              bits += 8;
            }
            state.length += hold & (1 << state.extra) - 1;
            hold >>>= state.extra;
            bits -= state.extra;
            state.back += state.extra;
          }
          state.was = state.length;
          state.mode = DIST;
        /* falls through */
        case DIST:
          for (; ; ) {
            here = state.distcode[hold & (1 << state.distbits) - 1];
            here_bits = here >>> 24;
            here_op = here >>> 16 & 255;
            here_val = here & 65535;
            if (here_bits <= bits) {
              break;
            }
            if (have === 0) {
              break inf_leave;
            }
            have--;
            hold += input[next++] << bits;
            bits += 8;
          }
          if ((here_op & 240) === 0) {
            last_bits = here_bits;
            last_op = here_op;
            last_val = here_val;
            for (; ; ) {
              here = state.distcode[last_val + ((hold & (1 << last_bits + last_op) - 1) >> last_bits)];
              here_bits = here >>> 24;
              here_op = here >>> 16 & 255;
              here_val = here & 65535;
              if (last_bits + here_bits <= bits) {
                break;
              }
              if (have === 0) {
                break inf_leave;
              }
              have--;
              hold += input[next++] << bits;
              bits += 8;
            }
            hold >>>= last_bits;
            bits -= last_bits;
            state.back += last_bits;
          }
          hold >>>= here_bits;
          bits -= here_bits;
          state.back += here_bits;
          if (here_op & 64) {
            strm.msg = "invalid distance code";
            state.mode = BAD;
            break;
          }
          state.offset = here_val;
          state.extra = here_op & 15;
          state.mode = DISTEXT;
        /* falls through */
        case DISTEXT:
          if (state.extra) {
            n = state.extra;
            while (bits < n) {
              if (have === 0) {
                break inf_leave;
              }
              have--;
              hold += input[next++] << bits;
              bits += 8;
            }
            state.offset += hold & (1 << state.extra) - 1;
            hold >>>= state.extra;
            bits -= state.extra;
            state.back += state.extra;
          }
          if (state.offset > state.dmax) {
            strm.msg = "invalid distance too far back";
            state.mode = BAD;
            break;
          }
          state.mode = MATCH;
        /* falls through */
        case MATCH:
          if (left === 0) {
            break inf_leave;
          }
          copy = _out - left;
          if (state.offset > copy) {
            copy = state.offset - copy;
            if (copy > state.whave) {
              if (state.sane) {
                strm.msg = "invalid distance too far back";
                state.mode = BAD;
                break;
              }
            }
            if (copy > state.wnext) {
              copy -= state.wnext;
              from = state.wsize - copy;
            } else {
              from = state.wnext - copy;
            }
            if (copy > state.length) {
              copy = state.length;
            }
            from_source = state.window;
          } else {
            from_source = output;
            from = put - state.offset;
            copy = state.length;
          }
          if (copy > left) {
            copy = left;
          }
          left -= copy;
          state.length -= copy;
          do {
            output[put++] = from_source[from++];
          } while (--copy);
          if (state.length === 0) {
            state.mode = LEN;
          }
          break;
        case LIT:
          if (left === 0) {
            break inf_leave;
          }
          output[put++] = state.length;
          left--;
          state.mode = LEN;
          break;
        case CHECK:
          if (state.wrap) {
            while (bits < 32) {
              if (have === 0) {
                break inf_leave;
              }
              have--;
              hold |= input[next++] << bits;
              bits += 8;
            }
            _out -= left;
            strm.total_out += _out;
            state.total += _out;
            if (state.wrap & 4 && _out) {
              strm.adler = state.check = /*UPDATE_CHECK(state.check, put - _out, _out);*/
              state.flags ? crc32_1(state.check, output, _out, put - _out) : adler32_1(state.check, output, _out, put - _out);
            }
            _out = left;
            if (state.wrap & 4 && (state.flags ? hold : zswap32(hold)) !== state.check) {
              strm.msg = "incorrect data check";
              state.mode = BAD;
              break;
            }
            hold = 0;
            bits = 0;
          }
          state.mode = LENGTH;
        /* falls through */
        case LENGTH:
          if (state.wrap && state.flags) {
            while (bits < 32) {
              if (have === 0) {
                break inf_leave;
              }
              have--;
              hold += input[next++] << bits;
              bits += 8;
            }
            if (state.wrap & 4 && hold !== (state.total & 4294967295)) {
              strm.msg = "incorrect length check";
              state.mode = BAD;
              break;
            }
            hold = 0;
            bits = 0;
          }
          state.mode = DONE;
        /* falls through */
        case DONE:
          ret = Z_STREAM_END$1;
          break inf_leave;
        case BAD:
          ret = Z_DATA_ERROR$1;
          break inf_leave;
        case MEM:
          return Z_MEM_ERROR$1;
        case SYNC:
        /* falls through */
        default:
          return Z_STREAM_ERROR$1;
      }
    }
  strm.next_out = put;
  strm.avail_out = left;
  strm.next_in = next;
  strm.avail_in = have;
  state.hold = hold;
  state.bits = bits;
  if (state.wsize || _out !== strm.avail_out && state.mode < BAD && (state.mode < CHECK || flush !== Z_FINISH$1)) {
    if (updatewindow(strm, strm.output, strm.next_out, _out - strm.avail_out)) ;
  }
  _in -= strm.avail_in;
  _out -= strm.avail_out;
  strm.total_in += _in;
  strm.total_out += _out;
  state.total += _out;
  if (state.wrap & 4 && _out) {
    strm.adler = state.check = /*UPDATE_CHECK(state.check, strm.next_out - _out, _out);*/
    state.flags ? crc32_1(state.check, output, _out, strm.next_out - _out) : adler32_1(state.check, output, _out, strm.next_out - _out);
  }
  strm.data_type = state.bits + (state.last ? 64 : 0) + (state.mode === TYPE ? 128 : 0) + (state.mode === LEN_ || state.mode === COPY_ ? 256 : 0);
  if ((_in === 0 && _out === 0 || flush === Z_FINISH$1) && ret === Z_OK$1) {
    ret = Z_BUF_ERROR$1;
  }
  return ret;
};
var inflateEnd = (strm) => {
  if (inflateStateCheck(strm)) {
    return Z_STREAM_ERROR$1;
  }
  let state = strm.state;
  if (state.window) {
    state.window = null;
  }
  strm.state = null;
  return Z_OK$1;
};
var inflateGetHeader = (strm, head) => {
  if (inflateStateCheck(strm)) {
    return Z_STREAM_ERROR$1;
  }
  const state = strm.state;
  if ((state.wrap & 2) === 0) {
    return Z_STREAM_ERROR$1;
  }
  state.head = head;
  head.done = false;
  return Z_OK$1;
};
var inflateSetDictionary = (strm, dictionary) => {
  const dictLength = dictionary.length;
  let state;
  let dictid;
  let ret;
  if (inflateStateCheck(strm)) {
    return Z_STREAM_ERROR$1;
  }
  state = strm.state;
  if (state.wrap !== 0 && state.mode !== DICT) {
    return Z_STREAM_ERROR$1;
  }
  if (state.mode === DICT) {
    dictid = 1;
    dictid = adler32_1(dictid, dictionary, dictLength, 0);
    if (dictid !== state.check) {
      return Z_DATA_ERROR$1;
    }
  }
  ret = updatewindow(strm, dictionary, dictLength, dictLength);
  if (ret) {
    state.mode = MEM;
    return Z_MEM_ERROR$1;
  }
  state.havedict = 1;
  return Z_OK$1;
};
var inflateReset_1 = inflateReset;
var inflateReset2_1 = inflateReset2;
var inflateResetKeep_1 = inflateResetKeep;
var inflateInit_1 = inflateInit;
var inflateInit2_1 = inflateInit2;
var inflate_2$1 = inflate$2;
var inflateEnd_1 = inflateEnd;
var inflateGetHeader_1 = inflateGetHeader;
var inflateSetDictionary_1 = inflateSetDictionary;
var inflateInfo = "pako inflate (from Nodeca project)";
var inflate_1$2 = {
  inflateReset: inflateReset_1,
  inflateReset2: inflateReset2_1,
  inflateResetKeep: inflateResetKeep_1,
  inflateInit: inflateInit_1,
  inflateInit2: inflateInit2_1,
  inflate: inflate_2$1,
  inflateEnd: inflateEnd_1,
  inflateGetHeader: inflateGetHeader_1,
  inflateSetDictionary: inflateSetDictionary_1,
  inflateInfo
};
function GZheader() {
  this.text = 0;
  this.time = 0;
  this.xflags = 0;
  this.os = 0;
  this.extra = null;
  this.extra_len = 0;
  this.name = "";
  this.comment = "";
  this.hcrc = 0;
  this.done = false;
}
var gzheader = GZheader;
var toString = Object.prototype.toString;
var {
  Z_NO_FLUSH,
  Z_FINISH,
  Z_OK,
  Z_STREAM_END,
  Z_NEED_DICT,
  Z_STREAM_ERROR,
  Z_DATA_ERROR,
  Z_MEM_ERROR,
  Z_BUF_ERROR
} = constants$2;
var defaultOptions = {
  chunkSize: 1024 * 64,
  windowBits: 15,
  to: ""
};
function Inflate$1(options) {
  this.options = common.assign({}, defaultOptions, options || {});
  const opt = this.options;
  if (opt.raw && opt.windowBits >= 0 && opt.windowBits < 16) {
    opt.windowBits = -opt.windowBits;
    if (opt.windowBits === 0) {
      opt.windowBits = -15;
    }
  }
  if (opt.windowBits >= 0 && opt.windowBits < 16 && !(options && options.windowBits)) {
    opt.windowBits += 32;
  }
  if (opt.windowBits > 15 && opt.windowBits < 48) {
    if ((opt.windowBits & 15) === 0) {
      opt.windowBits |= 15;
    }
  }
  this.err = 0;
  this.msg = "";
  this.ended = false;
  this.chunks = [];
  this.strm = new zstream();
  this.strm.avail_out = 0;
  let status = inflate_1$2.inflateInit2(
    this.strm,
    opt.windowBits
  );
  if (status !== Z_OK) {
    throw new Error(messages[status]);
  }
  this.header = new gzheader();
  inflate_1$2.inflateGetHeader(this.strm, this.header);
  if (opt.dictionary) {
    if (typeof opt.dictionary === "string") {
      opt.dictionary = strings.string2buf(opt.dictionary);
    } else if (toString.call(opt.dictionary) === "[object ArrayBuffer]") {
      opt.dictionary = new Uint8Array(opt.dictionary);
    }
    if (opt.raw) {
      status = inflate_1$2.inflateSetDictionary(this.strm, opt.dictionary);
      if (status !== Z_OK) {
        throw new Error(messages[status]);
      }
    }
  }
}
Inflate$1.prototype.push = function(data, flush_mode) {
  const strm = this.strm;
  const chunkSize = this.options.chunkSize;
  const dictionary = this.options.dictionary;
  let status, _flush_mode, last_avail_out;
  if (this.ended) return false;
  if (flush_mode === ~~flush_mode) _flush_mode = flush_mode;
  else _flush_mode = flush_mode === true ? Z_FINISH : Z_NO_FLUSH;
  if (toString.call(data) === "[object ArrayBuffer]") {
    strm.input = new Uint8Array(data);
  } else {
    strm.input = data;
  }
  strm.next_in = 0;
  strm.avail_in = strm.input.length;
  for (; ; ) {
    if (strm.avail_out === 0) {
      strm.output = new Uint8Array(chunkSize);
      strm.next_out = 0;
      strm.avail_out = chunkSize;
    }
    status = inflate_1$2.inflate(strm, _flush_mode);
    if (status === Z_NEED_DICT && dictionary) {
      status = inflate_1$2.inflateSetDictionary(strm, dictionary);
      if (status === Z_OK) {
        status = inflate_1$2.inflate(strm, _flush_mode);
      } else if (status === Z_DATA_ERROR) {
        status = Z_NEED_DICT;
      }
    }
    while (strm.avail_in > 0 && status === Z_STREAM_END && strm.state.wrap & 2 && strm.state.flags !== 0 && strm.input[strm.next_in] !== 0) {
      inflate_1$2.inflateReset(strm);
      status = inflate_1$2.inflate(strm, _flush_mode);
    }
    switch (status) {
      case Z_STREAM_ERROR:
      case Z_DATA_ERROR:
      case Z_NEED_DICT:
      case Z_MEM_ERROR:
        this.onEnd(status);
        this.ended = true;
        return false;
    }
    last_avail_out = strm.avail_out;
    if (strm.next_out) {
      if (strm.avail_out === 0 || status === Z_STREAM_END || _flush_mode > 0) {
        if (this.options.to === "string") {
          let next_out_utf8 = strings.utf8border(strm.output, strm.next_out);
          let tail = strm.next_out - next_out_utf8;
          let utf8str = strings.buf2string(strm.output, next_out_utf8);
          strm.next_out = tail;
          strm.avail_out = chunkSize - tail;
          if (tail) strm.output.set(strm.output.subarray(next_out_utf8, next_out_utf8 + tail), 0);
          this.onData(utf8str);
        } else {
          this.onData(strm.output.length === strm.next_out ? strm.output : strm.output.subarray(0, strm.next_out));
          strm.avail_out = 0;
          strm.next_out = 0;
        }
      }
    }
    if ((status === Z_OK || status === Z_BUF_ERROR) && last_avail_out === 0) continue;
    if (status === Z_STREAM_END) {
      status = inflate_1$2.inflateEnd(this.strm);
      this.onEnd(status);
      this.ended = true;
      return true;
    }
    if (strm.avail_in === 0) {
      if (_flush_mode === Z_FINISH) {
        status = inflate_1$2.inflateEnd(this.strm);
        this.onEnd(status === Z_OK ? Z_BUF_ERROR : status);
        this.ended = true;
        return false;
      }
      break;
    }
  }
  return true;
};
Inflate$1.prototype.onData = function(chunk) {
  this.chunks.push(chunk);
};
Inflate$1.prototype.onEnd = function(status) {
  if (status === Z_OK) {
    if (this.options.to === "string") {
      this.result = this.chunks.join("");
    } else {
      this.result = common.flattenChunks(this.chunks);
    }
  }
  this.chunks = [];
  this.err = status;
  this.msg = this.strm.msg;
};
function inflate$1(input, options) {
  const inflator = new Inflate$1(options);
  inflator.push(input, true);
  if (inflator.err) throw inflator.msg || messages[inflator.err];
  return inflator.result;
}
function inflateRaw$1(input, options) {
  options = options || {};
  options.raw = true;
  return inflate$1(input, options);
}
var Inflate_1$1 = Inflate$1;
var inflate_2 = inflate$1;
var inflateRaw_1$1 = inflateRaw$1;
var ungzip$1 = inflate$1;
var constants = constants$2;
var inflate_1$1 = {
  Inflate: Inflate_1$1,
  inflate: inflate_2,
  inflateRaw: inflateRaw_1$1,
  ungzip: ungzip$1,
  constants
};
var { Deflate, deflate, deflateRaw, gzip } = deflate_1$1;
var { Inflate, inflate, inflateRaw, ungzip } = inflate_1$1;
var Deflate_1 = Deflate;
var deflate_1 = deflate;
var deflateRaw_1 = deflateRaw;
var gzip_1 = gzip;
var Inflate_1 = Inflate;
var inflate_1 = inflate;
var inflateRaw_1 = inflateRaw;
var ungzip_1 = ungzip;
var constants_1 = constants$2;
var pako = {
  Deflate: Deflate_1,
  deflate: deflate_1,
  deflateRaw: deflateRaw_1,
  gzip: gzip_1,
  Inflate: Inflate_1,
  inflate: inflate_1,
  inflateRaw: inflateRaw_1,
  ungzip: ungzip_1,
  constants: constants_1
};

// src/data/versions.ts
var VERSIONS = [
  { id: "2x1", label: "Space Age 2.1", directionScale: 2, moduleFormat: "items-array", supportsQuality: true },
  { id: "spa", label: "Space Age 2.0", directionScale: 2, moduleFormat: "items-array", supportsQuality: true },
  { id: "2.0", label: "Factorio 2.0", directionScale: 2, moduleFormat: "items-array", supportsQuality: false },
  { id: "1.1", label: "Factorio 1.1", directionScale: 1, moduleFormat: "items-map", supportsQuality: false }
];
var DEFAULT_VERSION = VERSIONS[0];
function packGameVersion(dataset) {
  const raw = dataset.version?.base ?? Object.values(dataset.version ?? {})[0] ?? "2.0.0";
  const [major = 2, minor = 0, patch = 0] = raw.split(".").map((n) => Number(n) || 0);
  const packed = BigInt(major) << 48n | BigInt(minor) << 32n | BigInt(patch) << 16n;
  return Number(packed);
}

// src/core/blueprint.ts
function encodeModules(entity, profile) {
  const modules = entity.modules;
  if (!modules?.length) return void 0;
  if (profile.moduleFormat === "items-map") {
    const counts = {};
    for (const module of modules) counts[module.name] = (counts[module.name] ?? 0) + 1;
    return counts;
  }
  const inventory = entity.proto.moduleInventory;
  const plans = /* @__PURE__ */ new Map();
  modules.forEach((module, slot) => {
    const quality = profile.supportsQuality && module.quality && module.quality !== "normal" ? module.quality : void 0;
    const key3 = `${module.name}|${quality ?? ""}`;
    const plan = plans.get(key3) ?? { name: module.name, quality, slots: [] };
    plan.slots.push(slot);
    plans.set(key3, plan);
  });
  return [...plans.values()].map((plan) => ({
    id: plan.quality ? { name: plan.name, quality: plan.quality } : { name: plan.name },
    items: {
      in_inventory: plan.slots.map((stack) => ({ inventory, stack, count: 1 }))
    }
  }));
}
function buildIcons(scene) {
  const recipes = /* @__PURE__ */ new Set();
  for (const entity of scene.entities) if (entity.recipe) recipes.add(entity.recipe);
  const source = recipes.size > 0 ? [...recipes] : [...new Set(scene.entities.map((e) => e.proto.name))];
  return source.slice(0, 4).map((name, index) => ({ signal: { type: "item", name }, index: index + 1 }));
}
function toBlueprintJSON(scene, registry, options = {}) {
  const profile = registry.profile;
  const entities = scene.entities.map((entity, index) => {
    const direction = entity.dir / (profile.directionScale === 2 ? 1 : 2);
    const out = {
      entity_number: index + 1,
      name: entity.proto.name,
      // Blueprints store the centre of the footprint, so odd sizes land on .5 coordinates.
      position: { x: entity.x + entity.w / 2, y: entity.y + entity.h / 2 }
    };
    if (entity.dir !== 0) out.direction = direction;
    if (entity.recipe) out.recipe = entity.recipe;
    if (entity.undergroundType) out.type = entity.undergroundType;
    if (entity.quality && entity.quality !== "normal" && profile.supportsQuality) out.quality = entity.quality;
    const items = encodeModules(entity, profile);
    if (items) out.items = items;
    return out;
  });
  return {
    blueprint: {
      item: "blueprint",
      label: options.label ?? "Untitled",
      ...options.description ? { description: options.description } : {},
      icons: buildIcons(scene),
      entities,
      version: packGameVersion(registry.dataset)
    }
  };
}
function toBase64(bytes) {
  let binary = "";
  const CHUNK = 32768;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}
function fromBase64(text) {
  const binary = atob(text);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
function encodeBlueprint(json) {
  return "0" + toBase64(pako.deflate(JSON.stringify(json), { level: 9 }));
}
function decodeBlueprint(text) {
  const trimmed = text.trim();
  if (!trimmed.startsWith("0")) throw new Error(`unsupported blueprint version byte '${trimmed[0] ?? ""}'`);
  return JSON.parse(pako.inflate(fromBase64(trimmed.slice(1)), { to: "string" }));
}
function exportBlueprint(scene, registry, options = {}) {
  const json = toBlueprintJSON(scene, registry, options);
  return { json, text: encodeBlueprint(json) };
}

// src/data/balancers.json
var balancers_default = { source: 'https://factoriobin.com/post/KafN8H7L \u2014 "Belt Balancers", chapter "Yellow Belt balancer"', note: "Tier-agnostic: only belts, undergrounds and splitters. Directions are 16-point, positions are top-left tiles from (0, 0).", flow: "north", balancers: { "1-1": { w: 1, h: 3, e: [[0, 0, 0, 0], [0, 0, 1, 0], [0, 0, 2, 0]] }, "1-2": { w: 2, h: 3, e: [[0, 0, 0, 0], [0, 1, 0, 0], [2, 0, 1, 0], [0, 0, 2, 0]] }, "1-3": { w: 4, h: 6, e: [[0, 1, 0, 0], [0, 2, 0, 0], [0, 3, 0, 0], [0, 0, 1, 4], [0, 1, 1, 0], [2, 2, 1, 0], [0, 0, 2, 0], [2, 1, 2, 12], [0, 2, 2, 12], [0, 3, 2, 0], [0, 0, 3, 8], [2, 2, 3, 0], [0, 0, 4, 4], [0, 1, 4, 4], [0, 2, 4, 0], [0, 3, 4, 0], [0, 3, 5, 0]] }, "1-4": { w: 4, h: 4, e: [[0, 0, 0, 0], [0, 1, 0, 0], [0, 2, 0, 0], [0, 3, 0, 0], [2, 0, 1, 0], [2, 2, 1, 0], [2, 1, 2, 0], [0, 1, 3, 0]] }, "1-5": { w: 5, h: 8, e: [[0, 0, 0, 0], [0, 1, 0, 0], [0, 2, 0, 0], [0, 3, 0, 0], [0, 4, 0, 0], [0, 0, 1, 0], [2, 1, 1, 0], [2, 3, 1, 0], [0, 0, 2, 0], [2, 1, 2, 12], [2, 2, 2, 0], [0, 0, 3, 8], [2, 2, 3, 12], [0, 3, 3, 0], [0, 4, 3, 12], [0, 0, 4, 8], [0, 1, 4, 8], [0, 3, 4, 12], [0, 4, 4, 0], [2, 0, 5, 8], [2, 3, 5, 0], [0, 1, 6, 4], [0, 2, 6, 4], [0, 3, 6, 0], [0, 4, 6, 0], [0, 4, 7, 0]] }, "1-6": { w: 6, h: 6, e: [[0, 0, 0, 0], [0, 1, 0, 0], [0, 2, 0, 0], [0, 3, 0, 0], [0, 4, 0, 0], [0, 5, 0, 0], [2, 0, 1, 0], [2, 2, 1, 0], [2, 4, 1, 0], [0, 0, 2, 0], [2, 1, 2, 12], [0, 2, 2, 0], [2, 3, 2, 0], [0, 0, 3, 8], [2, 2, 3, 0], [0, 0, 4, 4], [0, 1, 4, 4], [0, 2, 4, 0], [0, 3, 4, 0], [0, 3, 5, 0]] }, "1-7": { w: 7, h: 6, e: [[2, 0, 0, 0], [2, 2, 0, 0], [2, 4, 0, 0], [0, 6, 0, 0], [2, 1, 1, 0], [0, 3, 1, 4], [2, 4, 1, 4], [0, 5, 1, 0], [0, 6, 1, 0], [2, 2, 2, 0], [2, 5, 2, 4], [0, 6, 2, 0], [0, 2, 3, 0], [0, 3, 3, 0], [0, 6, 3, 8], [0, 2, 4, 0], [0, 3, 4, 0], [0, 4, 4, 12], [0, 5, 4, 12], [0, 6, 4, 12], [0, 2, 5, 0]] }, "1-8": { w: 8, h: 5, e: [[2, 0, 0, 0], [2, 2, 0, 0], [2, 4, 0, 0], [2, 6, 0, 0], [2, 1, 1, 0], [2, 5, 1, 0], [0, 2, 2, 0], [0, 3, 2, 12], [0, 4, 2, 4], [0, 5, 2, 0], [2, 3, 3, 0], [0, 3, 4, 0]] }, "2-1": { w: 2, h: 3, e: [[0, 1, 0, 0], [2, 0, 1, 0], [0, 0, 2, 0], [0, 1, 2, 0]] }, "2-2": { w: 2, h: 3, e: [[0, 0, 0, 0], [0, 1, 0, 0], [2, 0, 1, 0], [0, 0, 2, 0], [0, 1, 2, 0]] }, "2-3-long": { w: 5, h: 7, e: [[0, 0, 0, 8], [0, 1, 0, 12], [0, 2, 0, 0], [0, 3, 0, 0], [0, 4, 0, 0], [0, 0, 1, 8], [2, 1, 1, 0], [2, 3, 1, 0], [0, 0, 2, 8], [1, 1, 2, 0, 1], [2, 2, 2, 0], [0, 4, 2, 0], [0, 0, 3, 4], [0, 1, 3, 4], [0, 2, 3, 0], [0, 4, 3, 0], [1, 1, 4, 0, 0], [0, 2, 4, 8], [0, 3, 4, 12], [0, 4, 4, 0], [0, 1, 5, 0], [0, 2, 5, 12], [2, 3, 5, 0], [0, 3, 6, 0], [0, 4, 6, 0]] }, "2-3-wide": { w: 7, h: 5, e: [[0, 0, 0, 8], [0, 1, 0, 12], [0, 2, 0, 12], [0, 3, 0, 0], [0, 4, 0, 0], [0, 5, 0, 0], [0, 0, 1, 8], [2, 2, 1, 0], [2, 4, 1, 0], [0, 0, 2, 4], [2, 1, 2, 4], [0, 2, 2, 0], [2, 3, 2, 0], [0, 5, 2, 0], [0, 6, 2, 12], [1, 2, 3, 4, 0], [0, 3, 3, 0], [0, 4, 3, 0], [1, 5, 3, 4, 1], [0, 6, 3, 0], [0, 3, 4, 0], [0, 4, 4, 0]] }, "2-4": { w: 4, h: 4, e: [[0, 0, 0, 0], [0, 1, 0, 0], [0, 2, 0, 0], [0, 3, 0, 0], [2, 0, 1, 0], [2, 2, 1, 0], [2, 1, 2, 0], [0, 1, 3, 0], [0, 2, 3, 0]] }, "2-5": { w: 7, h: 6, e: [[0, 0, 0, 8], [0, 1, 0, 12], [0, 2, 0, 0], [0, 3, 0, 0], [0, 4, 0, 0], [0, 5, 0, 0], [0, 6, 0, 0], [1, 0, 1, 8, 0], [2, 1, 1, 0], [2, 3, 1, 0], [2, 5, 1, 0], [0, 0, 2, 4], [1, 1, 2, 4, 0], [0, 2, 2, 0], [0, 3, 2, 0], [1, 4, 2, 4, 1], [2, 5, 2, 4], [0, 6, 2, 0], [0, 0, 3, 0], [0, 1, 3, 12], [2, 2, 3, 0], [0, 4, 3, 4], [0, 6, 3, 8], [1, 0, 4, 8, 1], [2, 1, 4, 0], [2, 3, 4, 0], [0, 5, 4, 8], [0, 6, 4, 12], [0, 0, 5, 4], [0, 1, 5, 0], [0, 2, 5, 0], [0, 3, 5, 0], [0, 4, 5, 0], [0, 5, 5, 12]] }, "2-6": { w: 8, h: 7, e: [[0, 1, 0, 0], [0, 2, 0, 0], [0, 3, 0, 0], [0, 4, 0, 0], [0, 5, 0, 0], [0, 6, 0, 0], [0, 0, 1, 4], [0, 1, 1, 0], [2, 2, 1, 0], [2, 4, 1, 0], [0, 6, 1, 0], [0, 7, 1, 12], [0, 0, 2, 0], [2, 1, 2, 12], [0, 2, 2, 12], [0, 3, 2, 0], [0, 4, 2, 0], [0, 5, 2, 4], [2, 6, 2, 4], [0, 7, 2, 0], [0, 0, 3, 8], [2, 2, 3, 0], [2, 4, 3, 0], [0, 7, 3, 8], [0, 0, 4, 4], [0, 1, 4, 4], [0, 2, 4, 0], [2, 3, 4, 0], [0, 5, 4, 0], [0, 6, 4, 12], [0, 7, 4, 12], [0, 3, 5, 0], [0, 4, 5, 0], [0, 3, 6, 0], [0, 4, 6, 0]] }, "2-7": { w: 8, h: 7, e: [[0, 1, 0, 0], [0, 2, 0, 0], [0, 3, 0, 0], [0, 4, 0, 0], [0, 5, 0, 0], [0, 6, 0, 0], [0, 7, 0, 0], [0, 0, 1, 4], [0, 1, 1, 0], [2, 2, 1, 0], [2, 4, 1, 0], [2, 6, 1, 0], [0, 0, 2, 0], [2, 1, 2, 12], [0, 2, 2, 12], [0, 3, 2, 0], [0, 4, 2, 0], [0, 5, 2, 4], [0, 6, 2, 0], [0, 0, 3, 8], [2, 2, 3, 0], [2, 4, 3, 0], [0, 0, 4, 4], [2, 1, 4, 4], [0, 2, 4, 0], [2, 3, 4, 0], [0, 5, 4, 0], [0, 6, 4, 12], [1, 2, 5, 4, 0], [0, 3, 5, 0], [0, 4, 5, 0], [1, 5, 5, 4, 1], [0, 6, 5, 0], [0, 3, 6, 0], [0, 4, 6, 0]] }, "2-8": { w: 8, h: 5, e: [[2, 0, 0, 0], [2, 2, 0, 0], [2, 4, 0, 0], [2, 6, 0, 0], [2, 1, 1, 0], [2, 5, 1, 0], [0, 2, 2, 0], [0, 3, 2, 12], [0, 4, 2, 4], [0, 5, 2, 0], [2, 3, 3, 0], [0, 3, 4, 0], [0, 4, 4, 0]] }, "3-1": { w: 4, h: 7, e: [[0, 3, 0, 0], [0, 0, 1, 8], [0, 1, 1, 12], [0, 2, 1, 12], [0, 3, 1, 0], [0, 0, 2, 4], [2, 1, 2, 4], [2, 2, 2, 0], [0, 0, 3, 4], [0, 2, 3, 0], [0, 3, 3, 0], [0, 0, 4, 0], [0, 1, 4, 12], [0, 3, 4, 0], [0, 1, 5, 0], [2, 2, 5, 0], [0, 1, 6, 0], [0, 2, 6, 0], [0, 3, 6, 0]] }, "3-2": { w: 5, h: 7, e: [[0, 0, 0, 0], [0, 1, 0, 0], [2, 0, 1, 0], [0, 2, 1, 8], [0, 3, 1, 12], [0, 0, 2, 0], [0, 1, 2, 0], [0, 2, 2, 12], [1, 3, 2, 0, 1], [0, 0, 3, 0], [0, 2, 3, 4], [0, 3, 3, 4], [0, 4, 3, 8], [0, 0, 4, 0], [2, 1, 4, 0], [1, 3, 4, 0, 0], [0, 4, 4, 8], [2, 0, 5, 0], [2, 2, 5, 0], [0, 4, 5, 8], [0, 0, 6, 0], [0, 1, 6, 0], [0, 2, 6, 0], [0, 3, 6, 0], [0, 4, 6, 12]] }, "3-3": { w: 6, h: 7, e: [[0, 1, 0, 0], [0, 2, 0, 0], [0, 3, 0, 0], [1, 1, 1, 0, 1], [1, 2, 1, 0, 1], [0, 3, 1, 0], [0, 4, 1, 12], [0, 5, 1, 12], [0, 0, 2, 4], [0, 1, 2, 4], [0, 2, 2, 4], [0, 3, 2, 4], [2, 4, 2, 4], [0, 5, 2, 0], [0, 0, 3, 0], [1, 1, 3, 0, 0], [1, 2, 3, 0, 0], [0, 3, 3, 4], [0, 5, 3, 8], [0, 0, 4, 0], [2, 1, 4, 0], [0, 3, 4, 0], [0, 4, 4, 8], [0, 5, 4, 12], [2, 0, 5, 0], [2, 2, 5, 0], [0, 4, 5, 8], [0, 0, 6, 0], [0, 1, 6, 0], [0, 2, 6, 0], [0, 3, 6, 0], [0, 4, 6, 12]] }, "3-4": { w: 7, h: 8, e: [[0, 1, 0, 0], [0, 2, 0, 0], [0, 3, 0, 0], [0, 4, 0, 0], [2, 1, 1, 0], [2, 3, 1, 0], [0, 0, 2, 4], [0, 1, 2, 0], [2, 2, 2, 0], [0, 4, 2, 0], [2, 5, 2, 12], [0, 0, 3, 0], [1, 1, 3, 12, 1], [0, 2, 3, 0], [0, 3, 3, 0], [1, 4, 3, 12, 0], [0, 6, 3, 12], [0, 0, 4, 4], [1, 1, 4, 4, 0], [0, 2, 4, 0], [0, 3, 4, 0], [1, 4, 4, 4, 1], [2, 5, 4, 4], [0, 6, 4, 0], [0, 0, 5, 0], [0, 1, 5, 12], [0, 2, 5, 0], [0, 3, 5, 0], [0, 4, 5, 4], [0, 6, 5, 8], [2, 1, 6, 0], [2, 3, 6, 0], [0, 5, 6, 8], [0, 6, 6, 12], [0, 1, 7, 0], [0, 2, 7, 0], [0, 3, 7, 0], [0, 4, 7, 0], [0, 5, 7, 12]] }, "3-5": { w: 7, h: 11, e: [[0, 0, 0, 0], [0, 1, 0, 0], [0, 2, 0, 0], [0, 3, 0, 0], [0, 4, 0, 0], [2, 0, 1, 0], [2, 2, 1, 0], [0, 4, 1, 0], [0, 5, 1, 4], [0, 6, 1, 8], [0, 0, 2, 0], [1, 1, 2, 0, 1], [1, 2, 2, 0, 1], [0, 3, 2, 0], [2, 4, 2, 0], [0, 6, 2, 8], [0, 0, 3, 0], [2, 1, 3, 12], [0, 2, 3, 12], [2, 3, 3, 0], [0, 5, 3, 0], [1, 6, 3, 8, 0], [0, 0, 4, 8], [2, 2, 4, 0], [0, 4, 4, 4], [0, 5, 4, 0], [0, 0, 5, 4], [0, 1, 5, 4], [0, 2, 5, 0], [2, 3, 5, 0], [0, 0, 6, 8], [1, 1, 6, 12, 1], [0, 3, 6, 0], [0, 4, 6, 0], [1, 5, 6, 12, 0], [0, 6, 6, 12], [0, 0, 7, 8], [1, 1, 7, 0, 0], [1, 2, 7, 0, 0], [0, 3, 7, 0], [0, 4, 7, 0], [0, 5, 7, 4], [0, 6, 7, 0], [0, 0, 8, 8], [2, 1, 8, 0], [0, 3, 8, 0], [2, 4, 8, 0], [1, 6, 8, 8, 1], [0, 0, 9, 4], [0, 1, 9, 0], [2, 2, 9, 0], [0, 4, 9, 0], [0, 5, 9, 0], [0, 6, 9, 12], [0, 2, 10, 0], [0, 3, 10, 0], [0, 4, 10, 0]] }, "3-6": { w: 7, h: 7, e: [[0, 1, 0, 0], [0, 2, 0, 0], [0, 3, 0, 0], [0, 4, 0, 0], [0, 5, 0, 0], [0, 6, 0, 0], [2, 1, 1, 0], [2, 3, 1, 0], [2, 5, 1, 0], [0, 0, 2, 4], [1, 1, 2, 4, 0], [2, 2, 2, 0], [1, 4, 2, 4, 1], [2, 5, 2, 4], [0, 6, 2, 0], [0, 0, 3, 0], [0, 1, 3, 12], [0, 2, 3, 0], [0, 3, 3, 0], [0, 4, 3, 4], [0, 6, 3, 8], [2, 1, 4, 0], [2, 3, 4, 0], [0, 5, 4, 8], [0, 6, 4, 12], [0, 1, 5, 0], [0, 2, 5, 0], [0, 3, 5, 0], [0, 4, 5, 0], [0, 5, 5, 12], [0, 1, 6, 0], [0, 2, 6, 0], [0, 3, 6, 0]] }, "3-7": { w: 8, h: 7, e: [[0, 1, 0, 0], [0, 2, 0, 0], [0, 3, 0, 0], [0, 4, 0, 0], [0, 5, 0, 0], [0, 6, 0, 0], [0, 7, 0, 0], [2, 1, 1, 0], [2, 3, 1, 0], [2, 5, 1, 0], [0, 7, 1, 0], [0, 0, 2, 4], [1, 1, 2, 4, 0], [2, 2, 2, 0], [1, 4, 2, 4, 1], [2, 5, 2, 4], [0, 6, 2, 0], [0, 7, 2, 0], [0, 0, 3, 0], [0, 1, 3, 12], [0, 2, 3, 0], [0, 3, 3, 0], [0, 4, 3, 4], [2, 6, 3, 4], [0, 7, 3, 0], [2, 1, 4, 0], [2, 3, 4, 0], [0, 7, 4, 8], [0, 1, 5, 0], [0, 2, 5, 0], [0, 3, 5, 0], [0, 4, 5, 0], [0, 5, 5, 12], [0, 6, 5, 12], [0, 7, 5, 12], [0, 1, 6, 0], [0, 2, 6, 0], [0, 3, 6, 0]] }, "3-8": { w: 8, h: 10, e: [[2, 0, 0, 0], [2, 2, 0, 0], [2, 4, 0, 0], [2, 6, 0, 0], [0, 1, 1, 0], [0, 2, 1, 12], [0, 3, 1, 0], [0, 4, 1, 0], [0, 5, 1, 4], [0, 6, 1, 0], [2, 2, 2, 0], [2, 4, 2, 0], [0, 1, 3, 4], [0, 2, 3, 0], [2, 3, 3, 0], [0, 5, 3, 0], [2, 6, 3, 12], [0, 1, 4, 0], [1, 2, 4, 12, 1], [0, 3, 4, 0], [0, 4, 4, 0], [1, 5, 4, 12, 0], [0, 7, 4, 12], [0, 1, 5, 4], [1, 2, 5, 4, 0], [2, 3, 5, 0], [1, 5, 5, 4, 1], [2, 6, 5, 4], [0, 7, 5, 0], [0, 1, 6, 0], [0, 2, 6, 12], [0, 3, 6, 0], [0, 4, 6, 0], [0, 5, 6, 4], [0, 7, 6, 8], [2, 2, 7, 0], [2, 4, 7, 0], [0, 6, 7, 8], [0, 7, 7, 12], [0, 2, 8, 0], [0, 3, 8, 0], [0, 4, 8, 0], [0, 5, 8, 0], [0, 6, 8, 12], [0, 2, 9, 0], [0, 3, 9, 0], [0, 4, 9, 0]] }, "4-1": { w: 4, h: 4, e: [[0, 2, 0, 0], [2, 1, 1, 0], [2, 0, 2, 0], [2, 2, 2, 0], [0, 0, 3, 0], [0, 1, 3, 0], [0, 2, 3, 0], [0, 3, 3, 0]] }, "4-2": { w: 4, h: 4, e: [[0, 1, 0, 0], [0, 2, 0, 0], [2, 1, 1, 0], [2, 0, 2, 0], [2, 2, 2, 0], [0, 0, 3, 0], [0, 1, 3, 0], [0, 2, 3, 0], [0, 3, 3, 0]] }, "4-3": { w: 7, h: 8, e: [[0, 1, 0, 8], [0, 2, 0, 12], [0, 3, 0, 0], [0, 4, 0, 0], [0, 5, 0, 0], [0, 0, 1, 8], [0, 1, 1, 12], [2, 2, 1, 0], [2, 4, 1, 0], [0, 0, 2, 4], [2, 1, 2, 4], [0, 2, 2, 0], [0, 3, 2, 0], [0, 4, 2, 0], [0, 5, 2, 0], [0, 6, 2, 12], [0, 0, 3, 4], [1, 2, 3, 4, 0], [0, 3, 3, 0], [0, 4, 3, 0], [1, 5, 3, 4, 1], [0, 6, 3, 0], [0, 0, 4, 0], [2, 1, 4, 12], [1, 2, 4, 12, 1], [0, 3, 4, 0], [0, 4, 4, 0], [1, 5, 4, 12, 0], [0, 6, 4, 12], [0, 2, 5, 12], [2, 3, 5, 0], [0, 5, 5, 4], [0, 6, 5, 0], [2, 2, 6, 0], [2, 4, 6, 0], [0, 2, 7, 0], [0, 3, 7, 0], [0, 4, 7, 0], [0, 5, 7, 0]] }, "4-4": { w: 4, h: 10, e: [[0, 0, 0, 0], [0, 1, 0, 0], [0, 2, 0, 0], [0, 3, 0, 0], [2, 0, 1, 0], [2, 2, 1, 0], [0, 0, 2, 0], [1, 1, 2, 0, 1], [1, 2, 2, 0, 1], [0, 3, 2, 0], [0, 0, 3, 0], [0, 1, 3, 12], [0, 2, 3, 4], [0, 3, 3, 0], [2, 1, 4, 0], [0, 0, 5, 4], [0, 1, 5, 0], [0, 2, 5, 0], [0, 3, 5, 12], [0, 0, 6, 0], [1, 1, 6, 0, 0], [1, 2, 6, 0, 0], [0, 3, 6, 0], [0, 0, 7, 0], [2, 1, 7, 0], [0, 3, 7, 0], [2, 0, 8, 0], [2, 2, 8, 0], [0, 0, 9, 0], [0, 1, 9, 0], [0, 2, 9, 0], [0, 3, 9, 0]] }, "4-5": { w: 7, h: 11, e: [[0, 0, 0, 8], [0, 1, 0, 12], [0, 0, 1, 8], [2, 1, 1, 0], [2, 3, 1, 0], [2, 5, 1, 0], [0, 0, 2, 8], [0, 1, 2, 0], [1, 2, 2, 0, 1], [1, 3, 2, 0, 1], [2, 4, 2, 0], [0, 6, 2, 0], [0, 0, 3, 8], [0, 1, 3, 0], [2, 2, 3, 12], [0, 3, 3, 12], [0, 4, 3, 0], [0, 6, 3, 0], [0, 0, 4, 8], [0, 1, 4, 8], [2, 3, 4, 0], [0, 5, 4, 4], [0, 6, 4, 0], [2, 0, 5, 8], [0, 2, 5, 4], [0, 3, 5, 0], [2, 4, 5, 0], [0, 1, 6, 4], [0, 2, 6, 0], [1, 3, 6, 0, 0], [0, 4, 6, 0], [1, 5, 6, 0, 1], [0, 0, 7, 8], [1, 1, 7, 12, 1], [1, 2, 7, 0, 0], [0, 3, 7, 0], [0, 4, 7, 0], [1, 5, 7, 12, 0], [0, 6, 7, 12], [0, 0, 8, 4], [0, 1, 8, 8], [2, 2, 8, 0], [0, 4, 8, 0], [1, 5, 8, 0, 0], [0, 6, 8, 0], [0, 1, 9, 4], [0, 2, 9, 0], [2, 3, 9, 0], [2, 5, 9, 0], [0, 3, 10, 0], [0, 4, 10, 0], [0, 5, 10, 0], [0, 6, 10, 0]] }, "4-6": { w: 6, h: 11, e: [[0, 0, 0, 0], [0, 1, 0, 0], [0, 2, 0, 0], [0, 3, 0, 0], [0, 4, 0, 0], [0, 5, 0, 0], [2, 0, 1, 0], [2, 2, 1, 0], [2, 4, 1, 0], [0, 0, 2, 0], [1, 1, 2, 0, 1], [1, 2, 2, 0, 1], [2, 3, 2, 0], [0, 5, 2, 0], [0, 0, 3, 0], [2, 1, 3, 12], [0, 2, 3, 12], [0, 3, 3, 0], [0, 5, 3, 0], [0, 0, 4, 8], [2, 2, 4, 0], [0, 4, 4, 4], [0, 5, 4, 0], [0, 0, 5, 4], [0, 1, 5, 4], [0, 2, 5, 0], [1, 3, 5, 0, 1], [1, 4, 5, 0, 1], [0, 0, 6, 8], [0, 1, 6, 12], [0, 2, 6, 12], [0, 3, 6, 12], [0, 4, 6, 12], [0, 5, 6, 12], [0, 0, 7, 8], [1, 1, 7, 0, 0], [1, 2, 7, 0, 0], [1, 3, 7, 0, 0], [1, 4, 7, 0, 0], [0, 5, 7, 0], [0, 0, 8, 8], [2, 1, 8, 0], [2, 3, 8, 0], [0, 5, 8, 0], [0, 0, 9, 4], [0, 1, 9, 0], [2, 2, 9, 0], [2, 4, 9, 0], [0, 2, 10, 0], [0, 3, 10, 0], [0, 4, 10, 0], [0, 5, 10, 0]] }, "4-7": { w: 9, h: 9, e: [[0, 0, 0, 8], [0, 1, 0, 12], [0, 2, 0, 0], [0, 3, 0, 0], [0, 4, 0, 0], [0, 5, 0, 0], [0, 6, 0, 0], [0, 7, 0, 0], [0, 8, 0, 0], [0, 0, 1, 8], [2, 1, 1, 0], [2, 3, 1, 0], [2, 5, 1, 0], [2, 7, 1, 0], [0, 0, 2, 8], [1, 1, 2, 0, 1], [2, 2, 2, 0], [2, 4, 2, 0], [2, 6, 2, 0], [0, 8, 2, 0], [0, 0, 3, 4], [0, 1, 3, 4], [2, 2, 3, 4], [0, 3, 3, 0], [1, 4, 3, 0, 1], [1, 5, 3, 0, 1], [0, 7, 3, 0], [0, 8, 3, 0], [1, 3, 4, 4, 0], [1, 6, 4, 4, 1], [0, 7, 4, 0], [0, 8, 4, 0], [0, 3, 5, 4], [0, 4, 5, 4], [0, 5, 5, 4], [0, 6, 5, 4], [2, 7, 5, 4], [0, 8, 5, 0], [1, 1, 6, 0, 0], [0, 3, 6, 0], [1, 4, 6, 0, 0], [1, 5, 6, 0, 0], [0, 6, 6, 4], [0, 8, 6, 8], [0, 1, 7, 0], [1, 2, 7, 12, 1], [2, 3, 7, 0], [2, 5, 7, 0], [1, 7, 7, 12, 0], [0, 8, 7, 12], [0, 3, 8, 0], [0, 4, 8, 0], [0, 5, 8, 0], [0, 6, 8, 0]] }, "4-8": { w: 8, h: 6, e: [[0, 0, 0, 0], [0, 1, 0, 0], [0, 2, 0, 0], [0, 3, 0, 0], [0, 4, 0, 0], [0, 5, 0, 0], [0, 6, 0, 0], [0, 7, 0, 0], [2, 0, 1, 0], [2, 2, 1, 0], [2, 4, 1, 0], [2, 6, 1, 0], [0, 0, 2, 0], [0, 1, 2, 4], [1, 2, 2, 4, 0], [2, 3, 2, 0], [1, 5, 2, 4, 1], [2, 6, 2, 4], [0, 7, 2, 0], [0, 0, 3, 0], [0, 1, 3, 0], [0, 2, 3, 12], [0, 3, 3, 0], [0, 4, 3, 0], [0, 5, 3, 4], [0, 7, 3, 8], [0, 0, 4, 0], [1, 1, 4, 12, 1], [2, 2, 4, 0], [2, 4, 4, 0], [1, 6, 4, 12, 0], [0, 7, 4, 12], [0, 2, 5, 0], [0, 3, 5, 0], [0, 4, 5, 0], [0, 5, 5, 0]] }, "5-1": { w: 6, h: 7, e: [[0, 1, 0, 0], [0, 2, 0, 4], [0, 3, 0, 4], [0, 4, 0, 8], [2, 1, 1, 0], [2, 4, 1, 8], [0, 1, 2, 0], [0, 2, 2, 0], [2, 3, 2, 12], [0, 4, 2, 12], [0, 5, 2, 8], [0, 1, 3, 0], [2, 4, 3, 12], [0, 5, 3, 12], [2, 1, 4, 0], [0, 5, 4, 12], [2, 0, 5, 0], [2, 2, 5, 0], [0, 4, 5, 4], [0, 5, 5, 0], [0, 0, 6, 0], [0, 1, 6, 0], [0, 2, 6, 0], [0, 3, 6, 0], [0, 4, 6, 0]] }, "5-2": { w: 7, h: 7, e: [[0, 1, 0, 8], [0, 2, 0, 12], [0, 3, 0, 0], [0, 4, 0, 0], [0, 5, 0, 4], [0, 6, 0, 8], [0, 0, 1, 8], [0, 1, 1, 12], [2, 2, 1, 0], [2, 4, 1, 0], [1, 6, 1, 8, 0], [0, 0, 2, 4], [2, 1, 2, 4], [0, 2, 2, 0], [2, 3, 2, 0], [0, 5, 2, 0], [0, 6, 2, 12], [0, 0, 3, 4], [1, 2, 3, 4, 0], [0, 3, 3, 0], [0, 4, 3, 0], [1, 5, 3, 4, 1], [0, 6, 3, 0], [0, 0, 4, 0], [0, 3, 4, 0], [0, 4, 4, 0], [1, 6, 4, 8, 1], [2, 0, 5, 0], [2, 2, 5, 0], [2, 4, 5, 0], [0, 6, 5, 8], [0, 0, 6, 0], [0, 1, 6, 0], [0, 2, 6, 0], [0, 3, 6, 0], [0, 4, 6, 0], [0, 5, 6, 0], [0, 6, 6, 12]] }, "5-3": { w: 7, h: 11, e: [[0, 2, 0, 0], [0, 3, 0, 0], [0, 4, 0, 0], [0, 0, 1, 8], [0, 1, 1, 12], [0, 2, 1, 0], [2, 3, 1, 0], [0, 5, 1, 4], [0, 6, 1, 8], [1, 0, 2, 8, 0], [2, 1, 2, 0], [0, 3, 2, 0], [2, 4, 2, 0], [0, 6, 2, 8], [0, 0, 3, 4], [0, 1, 3, 0], [0, 2, 3, 0], [0, 3, 3, 0], [1, 4, 3, 0, 1], [1, 5, 3, 0, 1], [0, 6, 3, 8], [0, 0, 4, 0], [1, 1, 4, 12, 1], [2, 2, 4, 0], [1, 4, 4, 12, 0], [0, 5, 4, 12], [0, 6, 4, 12], [0, 1, 5, 4], [0, 2, 5, 0], [0, 3, 5, 0], [0, 4, 5, 4], [0, 5, 5, 4], [0, 6, 5, 8], [0, 1, 6, 0], [2, 3, 6, 0], [2, 5, 6, 12], [0, 6, 6, 12], [1, 0, 7, 8, 1], [0, 1, 7, 0], [2, 2, 7, 0], [0, 4, 7, 0], [0, 6, 7, 12], [0, 0, 8, 8], [2, 1, 8, 0], [0, 3, 8, 0], [1, 4, 8, 0, 0], [1, 5, 8, 0, 0], [0, 6, 8, 0], [0, 0, 9, 4], [0, 1, 9, 0], [0, 2, 9, 0], [2, 3, 9, 0], [2, 5, 9, 0], [0, 2, 10, 0], [0, 3, 10, 0], [0, 4, 10, 0], [0, 5, 10, 0], [0, 6, 10, 0]] }, "5-4": { w: 7, h: 10, e: [[2, 0, 0, 0], [2, 2, 0, 0], [0, 4, 0, 4], [0, 5, 0, 8], [0, 0, 1, 0], [1, 1, 1, 0, 1], [0, 2, 1, 0], [2, 3, 1, 0], [0, 5, 1, 4], [0, 6, 1, 8], [0, 0, 2, 0], [1, 1, 2, 12, 1], [0, 2, 2, 0], [0, 3, 2, 0], [1, 4, 2, 0, 1], [1, 5, 2, 12, 0], [0, 6, 2, 12], [1, 1, 3, 0, 0], [0, 2, 3, 0], [1, 3, 3, 0, 1], [0, 4, 3, 4], [0, 5, 3, 8], [2, 1, 4, 0], [0, 3, 4, 4], [0, 4, 4, 0], [2, 5, 4, 8], [0, 0, 5, 4], [0, 1, 5, 0], [2, 2, 5, 0], [2, 4, 5, 12], [0, 5, 5, 12], [0, 6, 5, 8], [0, 0, 6, 0], [0, 2, 6, 0], [0, 3, 6, 0], [0, 5, 6, 12], [0, 6, 6, 8], [0, 0, 7, 0], [2, 1, 7, 0], [1, 3, 7, 0, 0], [1, 4, 7, 0, 0], [0, 5, 7, 0], [0, 6, 7, 8], [2, 0, 8, 0], [2, 2, 8, 0], [2, 4, 8, 0], [0, 6, 8, 8], [0, 0, 9, 0], [0, 1, 9, 0], [0, 2, 9, 0], [0, 3, 9, 0], [0, 4, 9, 0], [0, 5, 9, 0], [0, 6, 9, 12]] }, "5-5": { w: 10, h: 11, e: [[0, 3, 0, 0], [0, 4, 0, 0], [0, 5, 0, 0], [0, 6, 0, 0], [0, 7, 0, 0], [0, 8, 0, 4], [0, 9, 0, 8], [0, 1, 1, 8], [0, 2, 1, 12], [2, 3, 1, 0], [2, 5, 1, 0], [2, 7, 1, 0], [0, 9, 1, 8], [0, 0, 2, 8], [0, 1, 2, 12], [2, 2, 2, 0], [0, 4, 2, 0], [0, 5, 2, 0], [1, 6, 2, 0, 1], [1, 7, 2, 0, 1], [0, 8, 2, 0], [0, 9, 2, 8], [0, 0, 3, 4], [2, 1, 3, 4], [0, 2, 3, 0], [1, 3, 3, 0, 1], [0, 4, 3, 0], [0, 5, 3, 0], [0, 6, 3, 12], [0, 7, 3, 12], [0, 8, 3, 0], [1, 9, 3, 8, 0], [0, 0, 4, 4], [1, 2, 4, 4, 0], [0, 3, 4, 4], [0, 4, 4, 0], [1, 5, 4, 4, 1], [2, 6, 4, 4], [0, 7, 4, 0], [0, 8, 4, 0], [0, 0, 5, 0], [0, 1, 5, 4], [0, 2, 5, 4], [0, 3, 5, 0], [0, 4, 5, 4], [0, 5, 5, 4], [0, 7, 5, 4], [0, 8, 5, 0], [0, 0, 6, 0], [0, 1, 6, 0], [2, 2, 6, 12], [1, 3, 6, 12, 1], [1, 4, 6, 0, 1], [1, 6, 6, 0, 0], [1, 7, 6, 0, 0], [1, 8, 6, 12, 0], [0, 9, 6, 12], [0, 0, 7, 0], [0, 1, 7, 12], [0, 3, 7, 12], [0, 4, 7, 12], [0, 5, 7, 12], [2, 6, 7, 0], [0, 8, 7, 4], [0, 9, 7, 0], [1, 3, 8, 0, 0], [1, 4, 8, 0, 0], [0, 5, 8, 0], [0, 6, 8, 0], [2, 7, 8, 0], [1, 9, 8, 8, 1], [2, 3, 9, 0], [2, 5, 9, 0], [0, 7, 9, 0], [0, 8, 9, 0], [0, 9, 9, 12], [0, 3, 10, 0], [0, 4, 10, 0], [0, 5, 10, 0], [0, 6, 10, 0], [0, 7, 10, 0]] }, "5-6": { w: 9, h: 12, e: [[2, 1, 0, 0], [2, 3, 0, 0], [2, 5, 0, 0], [1, 1, 1, 0, 1], [2, 2, 1, 0], [1, 4, 1, 0, 1], [0, 5, 1, 0], [0, 6, 1, 0], [0, 7, 1, 12], [0, 8, 1, 12], [0, 0, 2, 4], [0, 1, 2, 4], [0, 2, 2, 0], [0, 3, 2, 0], [0, 5, 2, 0], [0, 6, 2, 4], [0, 7, 2, 8], [0, 8, 2, 0], [0, 0, 3, 0], [1, 1, 3, 0, 0], [1, 3, 3, 0, 1], [2, 5, 3, 0], [0, 7, 3, 8], [0, 8, 3, 0], [1, 0, 4, 0, 1], [0, 1, 4, 0], [0, 2, 4, 12], [0, 3, 4, 12], [1, 4, 4, 0, 0], [1, 5, 4, 0, 1], [0, 6, 4, 0], [1, 7, 4, 8, 0], [0, 8, 4, 0], [0, 0, 5, 4], [0, 1, 5, 4], [1, 2, 5, 4, 0], [2, 3, 5, 0], [0, 5, 5, 4], [0, 6, 5, 0], [1, 7, 5, 4, 1], [0, 8, 5, 0], [0, 0, 6, 0], [0, 1, 6, 4], [1, 2, 6, 4, 0], [0, 3, 6, 0], [1, 4, 6, 0, 1], [0, 5, 6, 0], [2, 6, 6, 12], [1, 7, 6, 4, 1], [0, 8, 6, 8], [0, 0, 7, 0], [0, 1, 7, 0], [0, 2, 7, 12], [0, 3, 7, 0], [0, 4, 7, 12], [0, 5, 7, 12], [2, 7, 7, 12], [0, 8, 7, 12], [0, 0, 8, 0], [0, 1, 8, 12], [0, 2, 8, 0], [1, 3, 8, 0, 0], [1, 4, 8, 0, 0], [1, 5, 8, 0, 0], [0, 6, 8, 8], [0, 8, 8, 12], [1, 0, 9, 0, 0], [2, 1, 9, 0], [0, 3, 9, 0], [2, 4, 9, 0], [0, 6, 9, 8], [1, 7, 9, 8, 1], [0, 8, 9, 0], [2, 0, 10, 0], [2, 2, 10, 0], [0, 4, 10, 0], [0, 5, 10, 0], [0, 6, 10, 12], [0, 7, 10, 4], [0, 8, 10, 0], [0, 0, 11, 0], [0, 1, 11, 0], [0, 2, 11, 0], [0, 3, 11, 0], [0, 4, 11, 0]] }, "5-7": { w: 11, h: 13, e: [[0, 2, 0, 0], [0, 3, 0, 0], [0, 4, 0, 0], [0, 5, 0, 0], [0, 6, 0, 0], [0, 7, 0, 0], [0, 8, 0, 0], [2, 2, 1, 0], [2, 4, 1, 0], [2, 6, 1, 0], [0, 8, 1, 0], [0, 9, 1, 4], [0, 10, 1, 8], [0, 2, 2, 0], [2, 3, 2, 0], [2, 5, 2, 0], [0, 7, 2, 0], [2, 8, 2, 0], [0, 10, 2, 8], [2, 2, 3, 0], [1, 5, 3, 0, 1], [1, 6, 3, 0, 1], [2, 7, 3, 0], [0, 9, 3, 0], [0, 10, 3, 8], [0, 0, 4, 4], [0, 1, 4, 4], [0, 2, 4, 0], [0, 3, 4, 0], [0, 4, 4, 4], [0, 5, 4, 4], [0, 6, 4, 4], [0, 7, 4, 8], [2, 8, 4, 0], [0, 10, 4, 8], [0, 0, 5, 0], [0, 1, 5, 8], [0, 2, 5, 12], [0, 3, 5, 0], [0, 4, 5, 0], [1, 5, 5, 0, 0], [1, 6, 5, 0, 0], [0, 7, 5, 4], [0, 8, 5, 0], [0, 9, 5, 0], [1, 10, 5, 8, 0], [0, 0, 6, 0], [0, 1, 6, 8], [2, 2, 6, 0], [2, 4, 6, 0], [0, 6, 6, 0], [0, 7, 6, 12], [0, 8, 6, 4], [0, 9, 6, 0], [0, 0, 7, 0], [0, 1, 7, 8], [1, 2, 7, 0, 1], [2, 3, 7, 0], [1, 5, 7, 0, 1], [0, 7, 7, 0], [0, 8, 7, 0], [0, 0, 8, 0], [0, 1, 8, 4], [0, 2, 8, 4], [0, 3, 8, 0], [0, 4, 8, 0], [2, 5, 8, 12], [1, 6, 8, 12, 1], [2, 7, 8, 0], [1, 9, 8, 12, 0], [0, 10, 8, 12], [0, 0, 9, 0], [1, 1, 9, 12, 1], [1, 2, 9, 0, 0], [1, 4, 9, 12, 0], [0, 6, 9, 12], [0, 7, 9, 0], [0, 8, 9, 0], [0, 9, 9, 4], [0, 10, 9, 0], [0, 2, 10, 0], [0, 3, 10, 12], [0, 4, 10, 12], [1, 5, 10, 0, 0], [2, 6, 10, 0], [2, 8, 10, 0], [1, 10, 10, 8, 1], [2, 4, 11, 0], [0, 6, 11, 0], [0, 7, 11, 0], [0, 8, 11, 0], [0, 9, 11, 0], [0, 10, 11, 12], [0, 4, 12, 0], [0, 5, 12, 0], [0, 6, 12, 0], [0, 7, 12, 0], [0, 8, 12, 0]] }, "5-8": { w: 10, h: 16, e: [[0, 0, 0, 0], [0, 1, 0, 0], [0, 2, 0, 0], [0, 3, 0, 0], [0, 4, 0, 0], [0, 5, 0, 0], [0, 6, 0, 0], [0, 7, 0, 0], [0, 0, 1, 0], [0, 1, 1, 0], [0, 2, 1, 0], [0, 3, 1, 0], [2, 4, 1, 0], [2, 6, 1, 0], [2, 0, 2, 0], [2, 2, 2, 0], [0, 4, 2, 0], [2, 5, 2, 0], [1, 7, 2, 0, 1], [0, 0, 3, 0], [2, 1, 3, 0], [2, 3, 3, 0], [0, 5, 3, 0], [0, 6, 3, 4], [0, 7, 3, 4], [0, 8, 3, 8], [0, 0, 4, 0], [0, 1, 4, 0], [1, 2, 4, 12, 1], [1, 3, 4, 0, 1], [1, 4, 4, 0, 1], [2, 5, 4, 0], [1, 7, 4, 12, 0], [0, 8, 4, 12], [0, 0, 5, 0], [0, 1, 5, 12], [0, 2, 5, 12], [0, 3, 5, 12], [0, 4, 5, 12], [0, 5, 5, 12], [0, 6, 5, 0], [1, 7, 5, 0, 0], [0, 8, 5, 4], [0, 9, 5, 8], [0, 1, 6, 8], [0, 2, 6, 12], [1, 3, 6, 0, 0], [1, 4, 6, 0, 0], [2, 5, 6, 0], [2, 7, 6, 0], [0, 9, 6, 8], [0, 0, 7, 8], [0, 1, 7, 12], [2, 2, 7, 0], [0, 4, 7, 0], [0, 5, 7, 0], [1, 6, 7, 0, 1], [1, 7, 7, 0, 1], [0, 8, 7, 0], [0, 9, 7, 8], [0, 0, 8, 4], [2, 1, 8, 4], [0, 2, 8, 0], [1, 3, 8, 0, 1], [0, 4, 8, 0], [0, 5, 8, 0], [0, 6, 8, 12], [0, 7, 8, 12], [0, 8, 8, 0], [1, 9, 8, 8, 0], [0, 0, 9, 4], [1, 2, 9, 4, 0], [0, 3, 9, 4], [0, 4, 9, 0], [1, 5, 9, 4, 1], [2, 6, 9, 4], [0, 7, 9, 0], [0, 8, 9, 0], [0, 0, 10, 0], [0, 1, 10, 4], [0, 2, 10, 4], [0, 3, 10, 0], [0, 4, 10, 4], [0, 5, 10, 4], [0, 7, 10, 4], [0, 8, 10, 0], [0, 0, 11, 0], [0, 1, 11, 0], [2, 2, 11, 12], [1, 3, 11, 12, 1], [1, 4, 11, 0, 1], [1, 6, 11, 0, 0], [1, 7, 11, 0, 0], [1, 8, 11, 12, 0], [0, 9, 11, 12], [0, 0, 12, 0], [0, 1, 12, 12], [0, 3, 12, 12], [0, 4, 12, 12], [0, 5, 12, 12], [2, 6, 12, 0], [0, 8, 12, 4], [0, 9, 12, 0], [1, 3, 13, 0, 0], [1, 4, 13, 0, 0], [0, 5, 13, 0], [2, 7, 13, 0], [1, 9, 13, 8, 1], [2, 3, 14, 0], [2, 5, 14, 0], [0, 7, 14, 0], [0, 8, 14, 0], [0, 9, 14, 12], [0, 3, 15, 0], [0, 4, 15, 0], [0, 5, 15, 0], [0, 6, 15, 0], [0, 7, 15, 0]] }, "6-1": { w: 6, h: 6, e: [[0, 0, 0, 8], [0, 1, 0, 12], [0, 2, 0, 12], [0, 3, 0, 0], [0, 0, 1, 4], [2, 1, 1, 4], [2, 2, 1, 0], [0, 0, 2, 4], [0, 2, 2, 0], [0, 3, 2, 0], [0, 0, 3, 0], [2, 3, 3, 0], [2, 0, 4, 0], [2, 2, 4, 0], [2, 4, 4, 0], [0, 0, 5, 0], [0, 1, 5, 0], [0, 2, 5, 0], [0, 3, 5, 0], [0, 4, 5, 0], [0, 5, 5, 0]] }, "6-2": { w: 7, h: 7, e: [[0, 1, 0, 8], [0, 2, 0, 12], [0, 4, 0, 0], [0, 5, 0, 0], [0, 0, 1, 8], [0, 1, 1, 12], [2, 2, 1, 0], [2, 4, 1, 0], [0, 0, 2, 4], [2, 1, 2, 4], [0, 2, 2, 0], [0, 3, 2, 0], [0, 4, 2, 0], [0, 5, 2, 0], [0, 6, 2, 12], [0, 0, 3, 4], [1, 2, 3, 4, 0], [2, 3, 3, 0], [1, 5, 3, 4, 1], [0, 6, 3, 0], [0, 0, 4, 0], [0, 3, 4, 0], [0, 4, 4, 0], [2, 0, 5, 0], [2, 2, 5, 0], [2, 4, 5, 0], [0, 0, 6, 0], [0, 1, 6, 0], [0, 2, 6, 0], [0, 3, 6, 0], [0, 4, 6, 0], [0, 5, 6, 0]] }, "6-3": { w: 7, h: 7, e: [[0, 1, 0, 8], [0, 2, 0, 12], [0, 3, 0, 0], [0, 4, 0, 0], [0, 5, 0, 0], [0, 0, 1, 8], [0, 1, 1, 12], [2, 2, 1, 0], [2, 4, 1, 0], [0, 0, 2, 4], [2, 1, 2, 4], [0, 2, 2, 0], [0, 3, 2, 0], [0, 4, 2, 0], [0, 5, 2, 0], [0, 6, 2, 12], [0, 0, 3, 4], [1, 2, 3, 4, 0], [2, 3, 3, 0], [1, 5, 3, 4, 1], [0, 6, 3, 0], [0, 0, 4, 0], [0, 3, 4, 0], [0, 4, 4, 0], [2, 0, 5, 0], [2, 2, 5, 0], [2, 4, 5, 0], [0, 0, 6, 0], [0, 1, 6, 0], [0, 2, 6, 0], [0, 3, 6, 0], [0, 4, 6, 0], [0, 5, 6, 0]] }, "6-4": { w: 6, h: 11, e: [[0, 0, 0, 0], [0, 1, 0, 0], [0, 2, 0, 0], [0, 3, 0, 0], [2, 0, 1, 0], [2, 2, 1, 0], [0, 4, 1, 4], [0, 5, 1, 8], [0, 0, 2, 0], [2, 1, 2, 0], [2, 3, 2, 0], [0, 5, 2, 8], [0, 0, 3, 0], [1, 1, 3, 0, 1], [1, 2, 3, 0, 1], [1, 3, 3, 0, 1], [1, 4, 3, 0, 1], [0, 5, 3, 8], [0, 0, 4, 0], [0, 1, 4, 12], [0, 2, 4, 12], [0, 3, 4, 12], [0, 4, 4, 12], [0, 5, 4, 12], [1, 1, 5, 0, 0], [1, 2, 5, 0, 0], [0, 3, 5, 4], [0, 4, 5, 4], [0, 5, 5, 8], [0, 0, 6, 4], [0, 1, 6, 0], [2, 2, 6, 0], [2, 4, 6, 12], [0, 5, 6, 12], [0, 0, 7, 0], [0, 2, 7, 0], [0, 3, 7, 0], [0, 5, 7, 12], [0, 0, 8, 0], [2, 1, 8, 0], [1, 3, 8, 0, 0], [1, 4, 8, 0, 0], [0, 5, 8, 0], [2, 0, 9, 0], [2, 2, 9, 0], [2, 4, 9, 0], [0, 0, 10, 0], [0, 1, 10, 0], [0, 2, 10, 0], [0, 3, 10, 0], [0, 4, 10, 0], [0, 5, 10, 0]] }, "6-5": { w: 9, h: 13, e: [[0, 4, 0, 0], [0, 5, 0, 0], [0, 6, 0, 0], [0, 7, 0, 0], [0, 8, 0, 0], [0, 0, 1, 4], [0, 1, 1, 8], [0, 2, 1, 8], [0, 3, 1, 12], [0, 4, 1, 0], [2, 5, 1, 0], [2, 7, 1, 0], [0, 0, 2, 0], [1, 1, 2, 8, 0], [0, 2, 2, 8], [2, 3, 2, 0], [0, 5, 2, 0], [2, 6, 2, 0], [1, 8, 2, 0, 1], [0, 0, 3, 0], [2, 1, 3, 12], [0, 2, 3, 12], [1, 3, 3, 0, 1], [1, 4, 3, 0, 1], [1, 5, 3, 0, 1], [0, 6, 3, 0], [0, 7, 3, 0], [0, 8, 3, 12], [0, 0, 4, 8], [2, 2, 4, 12], [0, 3, 4, 12], [0, 4, 4, 12], [0, 5, 4, 12], [0, 6, 4, 0], [0, 7, 4, 12], [0, 8, 4, 0], [0, 0, 5, 4], [1, 1, 5, 4, 0], [0, 3, 5, 12], [1, 4, 5, 0, 0], [0, 5, 5, 0], [1, 6, 5, 4, 1], [0, 7, 5, 0], [0, 8, 5, 0], [0, 0, 6, 4], [1, 1, 6, 4, 0], [0, 2, 6, 4], [0, 3, 6, 0], [2, 4, 6, 0], [1, 6, 6, 4, 1], [0, 7, 6, 4], [0, 8, 6, 0], [0, 0, 7, 0], [1, 1, 7, 8, 1], [0, 2, 7, 0], [1, 3, 7, 0, 0], [1, 4, 7, 0, 1], [0, 5, 7, 0], [0, 6, 7, 12], [0, 7, 7, 12], [1, 8, 7, 0, 0], [0, 0, 8, 0], [0, 1, 8, 8], [2, 2, 8, 0], [1, 5, 8, 0, 0], [1, 7, 8, 0, 1], [0, 8, 8, 0], [0, 0, 9, 0], [0, 1, 9, 4], [0, 2, 9, 0], [0, 3, 9, 0], [0, 5, 9, 0], [0, 6, 9, 4], [0, 7, 9, 4], [0, 8, 9, 0], [0, 0, 10, 0], [0, 1, 10, 12], [0, 2, 10, 12], [0, 3, 10, 0], [1, 4, 10, 0, 0], [2, 5, 10, 0], [1, 7, 10, 0, 0], [2, 2, 11, 0], [2, 4, 11, 0], [2, 6, 11, 0], [0, 2, 12, 0], [0, 3, 12, 0], [0, 4, 12, 0], [0, 5, 12, 0], [0, 6, 12, 0], [0, 7, 12, 0]] }, "6-6": { w: 9, h: 11, e: [[0, 3, 0, 0], [0, 4, 0, 0], [0, 5, 0, 0], [0, 6, 0, 0], [0, 7, 0, 0], [0, 8, 0, 0], [0, 1, 1, 8], [0, 2, 1, 12], [2, 3, 1, 0], [2, 5, 1, 0], [2, 7, 1, 0], [0, 0, 2, 8], [0, 1, 2, 12], [2, 2, 2, 0], [0, 4, 2, 0], [0, 5, 2, 0], [1, 6, 2, 0, 1], [1, 7, 2, 0, 1], [0, 8, 2, 0], [0, 0, 3, 4], [2, 1, 3, 4], [0, 2, 3, 0], [1, 3, 3, 0, 1], [0, 4, 3, 0], [0, 5, 3, 0], [0, 6, 3, 12], [0, 7, 3, 12], [0, 8, 3, 0], [0, 0, 4, 4], [1, 2, 4, 4, 0], [0, 3, 4, 4], [0, 4, 4, 0], [1, 5, 4, 4, 1], [2, 6, 4, 4], [0, 7, 4, 0], [0, 8, 4, 0], [0, 0, 5, 0], [0, 1, 5, 4], [0, 2, 5, 4], [0, 3, 5, 0], [0, 4, 5, 4], [0, 5, 5, 4], [0, 7, 5, 4], [0, 8, 5, 0], [0, 0, 6, 0], [0, 1, 6, 0], [2, 2, 6, 12], [1, 3, 6, 12, 1], [1, 4, 6, 0, 1], [1, 7, 6, 12, 0], [0, 8, 6, 12], [0, 0, 7, 0], [0, 1, 7, 12], [0, 3, 7, 12], [0, 4, 7, 12], [0, 5, 7, 12], [1, 6, 7, 0, 0], [1, 7, 7, 0, 0], [0, 8, 7, 0], [1, 3, 8, 0, 0], [1, 4, 8, 0, 0], [0, 5, 8, 0], [2, 6, 8, 0], [0, 8, 8, 0], [2, 3, 9, 0], [2, 5, 9, 0], [2, 7, 9, 0], [0, 3, 10, 0], [0, 4, 10, 0], [0, 5, 10, 0], [0, 6, 10, 0], [0, 7, 10, 0], [0, 8, 10, 0]] }, "6-7": { w: 10, h: 11, e: [[0, 3, 0, 0], [0, 4, 0, 0], [0, 5, 0, 0], [0, 6, 0, 0], [0, 7, 0, 0], [0, 8, 0, 0], [0, 9, 0, 0], [0, 1, 1, 8], [0, 2, 1, 12], [0, 3, 1, 0], [2, 4, 1, 0], [2, 6, 1, 0], [2, 8, 1, 0], [0, 1, 2, 8], [2, 2, 2, 0], [1, 4, 2, 0, 1], [0, 5, 2, 0], [0, 6, 2, 0], [1, 7, 2, 0, 1], [1, 8, 2, 0, 1], [0, 9, 2, 0], [0, 1, 3, 8], [0, 2, 3, 0], [1, 3, 3, 0, 1], [0, 4, 3, 4], [0, 5, 3, 0], [0, 6, 3, 0], [0, 7, 3, 12], [0, 8, 3, 12], [0, 9, 3, 0], [2, 0, 4, 8], [0, 2, 4, 0], [0, 3, 4, 12], [0, 4, 4, 0], [0, 5, 4, 4], [0, 6, 4, 4], [2, 7, 4, 4], [0, 8, 4, 0], [0, 9, 4, 0], [0, 0, 5, 8], [0, 1, 5, 4], [1, 2, 5, 4, 0], [2, 3, 5, 0], [1, 5, 5, 0, 1], [1, 6, 5, 4, 1], [0, 8, 5, 4], [0, 9, 5, 0], [0, 0, 6, 8], [0, 1, 6, 4], [0, 2, 6, 4], [0, 3, 6, 0], [0, 4, 6, 0], [0, 5, 6, 12], [0, 6, 6, 12], [0, 7, 6, 12], [0, 8, 6, 12], [0, 9, 6, 12], [0, 0, 7, 8], [0, 1, 7, 0], [1, 2, 7, 12, 1], [1, 3, 7, 0, 0], [1, 4, 7, 0, 0], [1, 5, 7, 12, 0], [0, 6, 7, 12], [1, 7, 7, 0, 0], [1, 8, 7, 0, 0], [0, 9, 7, 0], [0, 0, 8, 4], [0, 1, 8, 4], [0, 2, 8, 8], [2, 3, 8, 0], [1, 5, 8, 0, 0], [0, 6, 8, 0], [2, 7, 8, 0], [0, 9, 8, 0], [0, 2, 9, 4], [0, 3, 9, 0], [2, 4, 9, 0], [2, 6, 9, 0], [2, 8, 9, 0], [0, 4, 10, 0], [0, 5, 10, 0], [0, 6, 10, 0], [0, 7, 10, 0], [0, 8, 10, 0], [0, 9, 10, 0]] }, "6-8": { w: 10, h: 13, e: [[0, 2, 0, 0], [0, 3, 0, 0], [0, 4, 0, 0], [0, 5, 0, 0], [0, 6, 0, 0], [0, 7, 0, 0], [0, 8, 0, 0], [0, 9, 0, 0], [2, 2, 1, 0], [2, 4, 1, 0], [2, 6, 1, 0], [2, 8, 1, 0], [0, 2, 2, 0], [2, 3, 2, 0], [1, 5, 2, 0, 1], [1, 6, 2, 0, 1], [2, 7, 2, 0], [0, 9, 2, 0], [2, 2, 3, 0], [0, 4, 3, 4], [0, 5, 3, 4], [0, 6, 3, 4], [0, 7, 3, 8], [2, 8, 3, 0], [0, 0, 4, 4], [0, 1, 4, 4], [0, 2, 4, 0], [0, 3, 4, 0], [0, 4, 4, 0], [1, 5, 4, 0, 0], [1, 6, 4, 0, 0], [0, 7, 4, 4], [0, 8, 4, 0], [0, 9, 4, 0], [0, 0, 5, 0], [0, 1, 5, 8], [0, 2, 5, 12], [0, 3, 5, 0], [0, 4, 5, 0], [2, 5, 5, 0], [0, 8, 5, 4], [0, 9, 5, 0], [0, 0, 6, 0], [0, 1, 6, 8], [2, 2, 6, 0], [2, 4, 6, 0], [0, 6, 6, 0], [0, 7, 6, 12], [0, 8, 6, 0], [0, 0, 7, 0], [0, 1, 7, 8], [1, 2, 7, 0, 1], [2, 3, 7, 0], [1, 5, 7, 0, 1], [1, 7, 7, 0, 1], [1, 8, 7, 0, 1], [0, 0, 8, 0], [0, 1, 8, 4], [0, 2, 8, 4], [0, 3, 8, 0], [0, 4, 8, 0], [2, 5, 8, 12], [0, 6, 8, 12], [0, 7, 8, 12], [0, 8, 8, 12], [0, 9, 8, 12], [0, 0, 9, 0], [1, 1, 9, 12, 1], [1, 2, 9, 0, 0], [1, 4, 9, 12, 0], [0, 6, 9, 12], [1, 7, 9, 0, 0], [1, 8, 9, 0, 0], [0, 9, 9, 0], [0, 2, 10, 0], [0, 3, 10, 12], [0, 4, 10, 12], [1, 5, 10, 0, 0], [0, 6, 10, 0], [2, 7, 10, 0], [0, 9, 10, 0], [2, 4, 11, 0], [2, 6, 11, 0], [2, 8, 11, 0], [0, 4, 12, 0], [0, 5, 12, 0], [0, 6, 12, 0], [0, 7, 12, 0], [0, 8, 12, 0], [0, 9, 12, 0]] }, "7-1": { w: 7, h: 8, e: [[0, 1, 0, 0], [0, 1, 1, 0], [0, 2, 1, 4], [0, 3, 1, 4], [0, 4, 1, 4], [0, 5, 1, 8], [2, 1, 2, 0], [2, 4, 2, 12], [0, 5, 2, 12], [0, 1, 3, 0], [0, 2, 3, 0], [2, 3, 3, 12], [0, 5, 3, 12], [0, 6, 3, 12], [0, 1, 4, 0], [0, 4, 4, 12], [0, 6, 4, 0], [2, 1, 5, 0], [0, 4, 5, 0], [0, 6, 5, 0], [2, 0, 6, 0], [2, 2, 6, 0], [2, 4, 6, 0], [0, 6, 6, 0], [0, 0, 7, 0], [0, 1, 7, 0], [0, 2, 7, 0], [0, 3, 7, 0], [0, 4, 7, 0], [0, 5, 7, 0], [0, 6, 7, 0]] }, "7-2": { w: 8, h: 7, e: [[0, 1, 0, 4], [1, 2, 0, 4, 0], [0, 3, 0, 0], [0, 4, 0, 0], [1, 5, 0, 4, 1], [2, 6, 0, 4], [0, 1, 1, 0], [0, 2, 1, 12], [2, 3, 1, 0], [0, 5, 1, 4], [0, 7, 1, 8], [2, 2, 2, 0], [2, 4, 2, 0], [2, 6, 2, 12], [0, 7, 2, 12], [0, 1, 3, 4], [0, 2, 3, 0], [0, 3, 3, 0], [0, 4, 3, 0], [0, 5, 3, 0], [0, 7, 3, 12], [0, 1, 4, 0], [0, 3, 4, 0], [0, 4, 4, 0], [0, 6, 4, 4], [0, 7, 4, 0], [2, 0, 5, 0], [2, 2, 5, 0], [2, 4, 5, 0], [0, 6, 5, 0], [0, 0, 6, 0], [0, 1, 6, 0], [0, 2, 6, 0], [0, 3, 6, 0], [0, 4, 6, 0], [0, 5, 6, 0], [0, 6, 6, 0]] }, "7-3": { w: 8, h: 7, e: [[0, 0, 0, 8], [0, 1, 0, 12], [0, 2, 0, 12], [0, 3, 0, 12], [0, 4, 0, 0], [0, 5, 0, 0], [0, 6, 0, 0], [0, 0, 1, 4], [2, 1, 1, 4], [2, 3, 1, 0], [2, 5, 1, 0], [0, 0, 2, 4], [2, 2, 2, 4], [0, 3, 2, 0], [0, 4, 2, 0], [0, 5, 2, 0], [0, 6, 2, 0], [0, 7, 2, 12], [0, 0, 3, 0], [0, 1, 3, 4], [1, 3, 3, 4, 0], [2, 4, 3, 0], [1, 6, 3, 4, 1], [0, 7, 3, 0], [0, 0, 4, 0], [0, 1, 4, 0], [0, 4, 4, 0], [0, 5, 4, 0], [0, 0, 5, 0], [2, 1, 5, 0], [2, 3, 5, 0], [2, 5, 5, 0], [0, 0, 6, 0], [0, 1, 6, 0], [0, 2, 6, 0], [0, 3, 6, 0], [0, 4, 6, 0], [0, 5, 6, 0], [0, 6, 6, 0]] }, "7-4": { w: 9, h: 9, e: [[0, 2, 0, 0], [0, 3, 0, 0], [0, 4, 0, 0], [0, 5, 0, 0], [0, 0, 1, 8], [1, 1, 1, 12, 1], [2, 2, 1, 0], [2, 4, 1, 0], [1, 6, 1, 12, 0], [0, 7, 1, 12], [0, 0, 2, 4], [2, 1, 2, 4], [0, 2, 2, 0], [1, 3, 2, 0, 1], [1, 4, 2, 0, 1], [0, 5, 2, 0], [0, 6, 2, 12], [1, 7, 2, 0, 1], [0, 0, 3, 4], [1, 2, 3, 4, 0], [1, 5, 3, 4, 1], [0, 6, 3, 0], [0, 0, 4, 0], [0, 2, 4, 4], [0, 3, 4, 4], [0, 4, 4, 4], [0, 5, 4, 4], [2, 6, 4, 4], [0, 0, 5, 0], [0, 2, 5, 0], [1, 3, 5, 0, 0], [1, 4, 5, 0, 0], [0, 5, 5, 4], [0, 7, 5, 4], [0, 8, 5, 8], [0, 0, 6, 0], [2, 1, 6, 0], [2, 3, 6, 0], [2, 5, 6, 0], [1, 7, 6, 0, 0], [0, 8, 6, 8], [2, 0, 7, 0], [2, 2, 7, 0], [2, 4, 7, 0], [2, 6, 7, 0], [0, 8, 7, 8], [0, 0, 8, 0], [0, 1, 8, 0], [0, 2, 8, 0], [0, 3, 8, 0], [0, 4, 8, 0], [0, 5, 8, 0], [0, 6, 8, 0], [0, 7, 8, 0], [0, 8, 8, 12]] }, "7-5": { w: 11, h: 13, e: [[0, 2, 0, 0], [0, 3, 0, 0], [0, 4, 0, 0], [0, 5, 0, 0], [0, 6, 0, 0], [0, 0, 1, 8], [0, 1, 1, 12], [0, 2, 1, 0], [0, 3, 1, 0], [0, 4, 1, 0], [2, 5, 1, 0], [1, 0, 2, 8, 0], [2, 1, 2, 0], [2, 3, 2, 0], [1, 5, 2, 0, 1], [0, 6, 2, 0], [0, 7, 2, 12], [0, 8, 2, 12], [0, 0, 3, 4], [0, 1, 3, 0], [0, 2, 3, 0], [0, 3, 3, 0], [0, 4, 3, 0], [2, 5, 3, 12], [1, 6, 3, 12, 1], [1, 8, 3, 0, 1], [1, 9, 3, 12, 0], [0, 10, 3, 12], [0, 0, 4, 0], [1, 1, 4, 12, 1], [2, 2, 4, 0], [1, 4, 4, 12, 0], [0, 6, 4, 12], [0, 7, 4, 4], [0, 8, 4, 4], [0, 9, 4, 8], [0, 10, 4, 0], [0, 1, 5, 4], [0, 2, 5, 0], [0, 3, 5, 0], [0, 4, 5, 12], [1, 5, 5, 0, 0], [2, 6, 5, 0], [1, 8, 5, 0, 0], [0, 9, 5, 8], [0, 10, 5, 0], [0, 1, 6, 0], [1, 4, 6, 0, 1], [2, 5, 6, 0], [2, 7, 6, 0], [0, 9, 6, 8], [0, 10, 6, 0], [1, 0, 7, 8, 1], [0, 1, 7, 0], [0, 2, 7, 4], [0, 3, 7, 4], [0, 4, 7, 8], [1, 5, 7, 0, 1], [0, 6, 7, 0], [0, 7, 7, 0], [0, 8, 7, 0], [0, 9, 7, 12], [0, 10, 7, 0], [0, 0, 8, 8], [2, 1, 8, 0], [0, 4, 8, 4], [0, 5, 8, 4], [0, 6, 8, 0], [0, 7, 8, 0], [0, 8, 8, 4], [0, 9, 8, 4], [0, 10, 8, 0], [0, 0, 9, 8], [0, 1, 9, 0], [2, 2, 9, 0], [1, 4, 9, 0, 0], [1, 5, 9, 0, 0], [2, 7, 9, 0], [0, 0, 10, 8], [2, 1, 10, 0], [0, 3, 10, 0], [2, 4, 10, 0], [2, 6, 10, 0], [0, 8, 10, 0], [0, 0, 11, 4], [0, 1, 11, 0], [0, 2, 11, 0], [2, 3, 11, 0], [2, 5, 11, 0], [2, 7, 11, 0], [0, 2, 12, 0], [0, 3, 12, 0], [0, 4, 12, 0], [0, 5, 12, 0], [0, 6, 12, 0], [0, 7, 12, 0], [0, 8, 12, 0]] }, "7-6": { w: 10, h: 10, e: [[0, 2, 0, 8], [0, 3, 0, 12], [2, 4, 0, 0], [2, 6, 0, 0], [2, 8, 0, 0], [0, 0, 1, 8], [0, 1, 1, 12], [0, 2, 1, 12], [2, 3, 1, 0], [1, 5, 1, 0, 1], [0, 6, 1, 0], [2, 7, 1, 0], [0, 9, 1, 0], [0, 0, 2, 8], [0, 1, 2, 4], [1, 2, 2, 4, 0], [1, 3, 2, 0, 1], [1, 4, 2, 0, 1], [1, 5, 2, 4, 1], [0, 6, 2, 0], [1, 7, 2, 0, 1], [1, 8, 2, 0, 1], [0, 9, 2, 0], [0, 0, 3, 8], [0, 1, 3, 0], [0, 2, 3, 12], [0, 3, 3, 12], [0, 4, 3, 4], [0, 5, 3, 4], [0, 6, 3, 4], [0, 7, 3, 4], [0, 8, 3, 4], [0, 9, 3, 0], [0, 0, 4, 8], [0, 1, 4, 8], [1, 2, 4, 12, 1], [2, 3, 4, 0], [1, 5, 4, 0, 0], [1, 6, 4, 12, 0], [2, 7, 4, 12], [0, 8, 4, 12], [0, 9, 4, 12], [2, 0, 5, 8], [0, 2, 5, 4], [0, 3, 5, 0], [0, 4, 5, 0], [0, 5, 5, 0], [0, 6, 5, 12], [0, 8, 5, 12], [0, 9, 5, 0], [0, 1, 6, 8], [0, 2, 6, 0], [1, 3, 6, 0, 0], [0, 4, 6, 0], [0, 5, 6, 12], [0, 6, 6, 4], [0, 7, 6, 4], [0, 8, 6, 0], [0, 9, 6, 0], [0, 1, 7, 8], [2, 2, 7, 0], [1, 4, 7, 0, 0], [0, 5, 7, 0], [0, 6, 7, 0], [1, 7, 7, 0, 0], [1, 8, 7, 0, 0], [0, 9, 7, 0], [0, 1, 8, 4], [0, 2, 8, 0], [0, 3, 8, 0], [2, 4, 8, 0], [2, 6, 8, 0], [2, 8, 8, 0], [0, 3, 9, 0], [0, 4, 9, 0], [0, 5, 9, 0], [0, 6, 9, 0], [0, 7, 9, 0], [0, 8, 9, 0], [0, 9, 9, 0]] }, "7-7": { w: 10, h: 11, e: [[0, 1, 0, 8], [0, 2, 0, 12], [0, 3, 0, 0], [0, 4, 0, 0], [0, 5, 0, 0], [0, 6, 0, 0], [0, 7, 0, 0], [0, 8, 0, 0], [0, 9, 0, 0], [0, 1, 1, 8], [2, 2, 1, 0], [2, 4, 1, 0], [2, 6, 1, 0], [2, 8, 1, 0], [0, 0, 2, 8], [0, 1, 2, 12], [0, 2, 2, 0], [2, 3, 2, 0], [0, 5, 2, 0], [0, 6, 2, 0], [1, 7, 2, 0, 1], [1, 8, 2, 0, 1], [0, 9, 2, 0], [1, 0, 3, 8, 0], [0, 2, 3, 0], [1, 3, 3, 0, 1], [1, 4, 3, 0, 1], [0, 5, 3, 0], [0, 6, 3, 0], [0, 7, 3, 12], [0, 8, 3, 12], [0, 9, 3, 0], [0, 0, 4, 4], [1, 1, 4, 4, 0], [0, 2, 4, 0], [0, 3, 4, 4], [0, 4, 4, 4], [0, 5, 4, 0], [1, 6, 4, 4, 1], [2, 7, 4, 4], [0, 8, 4, 0], [0, 9, 4, 0], [0, 0, 5, 0], [0, 1, 5, 12], [2, 2, 5, 0], [0, 5, 5, 4], [0, 6, 5, 4], [0, 8, 5, 4], [0, 9, 5, 0], [0, 1, 6, 0], [0, 2, 6, 0], [0, 3, 6, 0], [1, 4, 6, 12, 1], [1, 5, 6, 0, 1], [1, 6, 6, 12, 0], [0, 7, 6, 12], [0, 8, 6, 12], [0, 9, 6, 12], [0, 1, 7, 0], [0, 2, 7, 0], [0, 3, 7, 12], [0, 4, 7, 12], [0, 5, 7, 12], [0, 6, 7, 12], [1, 7, 7, 0, 0], [1, 8, 7, 0, 0], [0, 9, 7, 0], [1, 0, 8, 8, 1], [0, 1, 8, 0], [0, 2, 8, 12], [1, 3, 8, 0, 0], [1, 4, 8, 0, 0], [1, 5, 8, 0, 0], [0, 6, 8, 0], [2, 7, 8, 0], [0, 9, 8, 0], [0, 0, 9, 4], [0, 1, 9, 8], [2, 2, 9, 0], [2, 4, 9, 0], [2, 6, 9, 0], [2, 8, 9, 0], [0, 1, 10, 4], [0, 2, 10, 0], [0, 3, 10, 0], [0, 4, 10, 0], [0, 5, 10, 0], [0, 6, 10, 0], [0, 7, 10, 0], [0, 8, 10, 0], [0, 9, 10, 0]] }, "7-8": { w: 10, h: 15, e: [[2, 0, 0, 0], [2, 2, 0, 0], [2, 4, 0, 0], [2, 6, 0, 0], [0, 0, 1, 0], [2, 1, 1, 0], [0, 3, 1, 0], [1, 4, 1, 0, 1], [2, 5, 1, 0], [0, 7, 1, 0], [0, 8, 1, 12], [0, 9, 1, 12], [0, 0, 2, 0], [1, 1, 2, 0, 1], [1, 2, 2, 0, 1], [0, 3, 2, 0], [1, 4, 2, 12, 1], [1, 5, 2, 0, 1], [1, 6, 2, 0, 1], [1, 7, 2, 12, 0], [0, 8, 2, 12], [0, 9, 2, 0], [0, 0, 3, 0], [0, 1, 3, 12], [0, 2, 3, 12], [1, 3, 3, 12, 1], [1, 4, 3, 0, 0], [1, 5, 3, 12, 0], [0, 6, 3, 12], [0, 7, 3, 4], [0, 8, 3, 0], [0, 9, 3, 0], [0, 0, 4, 4], [0, 1, 4, 4], [2, 2, 4, 4], [0, 3, 4, 4], [0, 4, 4, 0], [2, 6, 4, 0], [0, 9, 4, 0], [0, 0, 5, 0], [0, 1, 5, 4], [1, 3, 5, 4, 0], [0, 4, 5, 4], [0, 5, 5, 4], [0, 6, 5, 0], [0, 7, 5, 0], [1, 8, 5, 4, 1], [0, 9, 5, 0], [0, 0, 6, 0], [0, 1, 6, 0], [0, 2, 6, 12], [0, 3, 6, 12], [0, 4, 6, 0], [1, 5, 6, 0, 0], [1, 6, 6, 0, 0], [0, 7, 6, 0], [2, 8, 6, 12], [0, 0, 7, 0], [1, 1, 7, 0, 0], [1, 2, 7, 0, 0], [0, 3, 7, 0], [2, 4, 7, 0], [0, 6, 7, 0], [0, 7, 7, 12], [0, 9, 7, 12], [2, 0, 8, 0], [2, 2, 8, 0], [1, 4, 8, 0, 1], [1, 5, 8, 0, 1], [0, 7, 8, 8], [0, 8, 8, 12], [0, 9, 8, 0], [0, 0, 9, 0], [1, 1, 9, 0, 1], [0, 2, 9, 0], [0, 3, 9, 0], [0, 4, 9, 12], [0, 5, 9, 12], [0, 6, 9, 12], [0, 7, 9, 12], [1, 8, 9, 0, 1], [0, 9, 9, 0], [0, 0, 10, 0], [0, 2, 10, 0], [0, 3, 10, 4], [0, 4, 10, 4], [0, 5, 10, 4], [0, 6, 10, 4], [0, 7, 10, 4], [2, 8, 10, 4], [0, 9, 10, 0], [0, 0, 11, 0], [1, 1, 11, 12, 1], [0, 2, 11, 0], [0, 3, 11, 0], [1, 5, 11, 12, 0], [0, 6, 11, 12], [0, 7, 11, 4], [0, 9, 11, 8], [1, 1, 12, 0, 0], [2, 2, 12, 0], [1, 4, 12, 0, 0], [1, 5, 12, 0, 0], [2, 6, 12, 0], [1, 8, 12, 0, 0], [0, 9, 12, 8], [2, 1, 13, 0], [2, 3, 13, 0], [2, 5, 13, 0], [2, 7, 13, 0], [0, 9, 13, 8], [0, 1, 14, 0], [0, 2, 14, 0], [0, 3, 14, 0], [0, 4, 14, 0], [0, 5, 14, 0], [0, 6, 14, 0], [0, 7, 14, 0], [0, 8, 14, 0], [0, 9, 14, 12]] }, "8-1": { w: 8, h: 6, e: [[0, 4, 0, 0], [2, 3, 1, 0], [0, 2, 2, 4], [0, 3, 2, 0], [0, 4, 2, 0], [0, 5, 2, 12], [2, 1, 3, 0], [2, 5, 3, 0], [2, 0, 4, 0], [2, 2, 4, 0], [2, 4, 4, 0], [2, 6, 4, 0], [0, 0, 5, 0], [0, 1, 5, 0], [0, 2, 5, 0], [0, 3, 5, 0], [0, 4, 5, 0], [0, 5, 5, 0], [0, 6, 5, 0], [0, 7, 5, 0]] }, "8-2": { w: 8, h: 6, e: [[0, 3, 0, 0], [0, 4, 0, 0], [2, 3, 1, 0], [0, 2, 2, 4], [0, 3, 2, 0], [0, 4, 2, 0], [0, 5, 2, 12], [2, 1, 3, 0], [2, 5, 3, 0], [2, 0, 4, 0], [2, 2, 4, 0], [2, 4, 4, 0], [2, 6, 4, 0], [0, 0, 5, 0], [0, 1, 5, 0], [0, 2, 5, 0], [0, 3, 5, 0], [0, 4, 5, 0], [0, 5, 5, 0], [0, 6, 5, 0], [0, 7, 5, 0]] }, "8-3": { w: 8, h: 10, e: [[0, 1, 0, 8], [0, 2, 0, 12], [0, 3, 0, 0], [0, 4, 0, 0], [0, 5, 0, 0], [0, 0, 1, 8], [0, 1, 1, 12], [2, 2, 1, 0], [2, 4, 1, 0], [0, 0, 2, 4], [2, 1, 2, 4], [0, 2, 2, 0], [1, 3, 2, 0, 1], [1, 4, 2, 0, 1], [0, 5, 2, 0], [0, 0, 3, 4], [0, 2, 3, 4], [0, 3, 3, 4], [0, 4, 3, 4], [0, 5, 3, 0], [2, 0, 4, 0], [1, 3, 4, 0, 0], [1, 4, 4, 0, 0], [0, 0, 5, 0], [0, 1, 5, 0], [1, 2, 5, 12, 1], [2, 3, 5, 0], [1, 5, 5, 12, 0], [0, 6, 5, 12], [0, 0, 6, 0], [0, 1, 6, 12], [0, 2, 6, 4], [0, 3, 6, 0], [0, 4, 6, 0], [0, 5, 6, 12], [0, 6, 6, 0], [2, 1, 7, 0], [2, 5, 7, 0], [2, 0, 8, 0], [2, 2, 8, 0], [2, 4, 8, 0], [2, 6, 8, 0], [0, 0, 9, 0], [0, 1, 9, 0], [0, 2, 9, 0], [0, 3, 9, 0], [0, 4, 9, 0], [0, 5, 9, 0], [0, 6, 9, 0], [0, 7, 9, 0]] }, "8-4": { w: 8, h: 7, e: [[0, 2, 0, 0], [0, 3, 0, 0], [0, 4, 0, 0], [0, 5, 0, 0], [0, 0, 1, 8], [1, 1, 1, 12, 1], [2, 2, 1, 0], [2, 4, 1, 0], [1, 6, 1, 12, 0], [0, 7, 1, 12], [0, 0, 2, 4], [2, 1, 2, 4], [0, 2, 2, 0], [0, 3, 2, 0], [0, 4, 2, 0], [0, 5, 2, 0], [0, 6, 2, 12], [0, 7, 2, 0], [0, 0, 3, 4], [1, 2, 3, 4, 0], [2, 3, 3, 0], [1, 5, 3, 4, 1], [0, 6, 3, 0], [0, 7, 3, 0], [0, 0, 4, 0], [0, 3, 4, 0], [0, 4, 4, 0], [0, 7, 4, 0], [2, 0, 5, 0], [2, 2, 5, 0], [2, 4, 5, 0], [2, 6, 5, 0], [0, 0, 6, 0], [0, 1, 6, 0], [0, 2, 6, 0], [0, 3, 6, 0], [0, 4, 6, 0], [0, 5, 6, 0], [0, 6, 6, 0], [0, 7, 6, 0]] }, "8-5": { w: 10, h: 17, e: [[0, 2, 0, 0], [0, 3, 0, 0], [0, 4, 0, 0], [0, 5, 0, 0], [0, 6, 0, 0], [0, 0, 1, 8], [0, 1, 1, 12], [0, 2, 1, 0], [0, 3, 1, 0], [0, 4, 1, 0], [2, 5, 1, 0], [1, 0, 2, 8, 0], [2, 1, 2, 0], [2, 3, 2, 0], [1, 5, 2, 0, 1], [1, 6, 2, 0, 1], [0, 0, 3, 4], [0, 1, 3, 0], [2, 2, 3, 0], [0, 4, 3, 0], [0, 5, 3, 12], [0, 6, 3, 12], [2, 7, 3, 12], [0, 8, 3, 12], [0, 9, 3, 12], [0, 0, 4, 0], [1, 1, 4, 12, 1], [1, 2, 4, 0, 1], [1, 3, 4, 0, 1], [1, 5, 4, 0, 0], [1, 6, 4, 12, 0], [0, 8, 4, 12], [0, 9, 4, 0], [0, 1, 5, 4], [0, 2, 5, 4], [2, 3, 5, 4], [0, 4, 5, 4], [0, 5, 5, 0], [0, 6, 5, 4], [0, 7, 5, 4], [0, 8, 5, 0], [0, 9, 5, 0], [0, 1, 6, 0], [0, 2, 6, 4], [1, 4, 6, 4, 0], [0, 5, 6, 4], [0, 6, 6, 0], [1, 7, 6, 4, 1], [2, 8, 6, 4], [0, 9, 6, 0], [1, 0, 7, 8, 1], [0, 1, 7, 0], [0, 2, 7, 0], [0, 3, 7, 12], [0, 4, 7, 12], [0, 5, 7, 0], [1, 6, 7, 0, 0], [0, 7, 7, 4], [0, 9, 7, 8], [0, 0, 8, 8], [0, 1, 8, 0], [1, 2, 8, 0, 0], [1, 3, 8, 0, 0], [0, 4, 8, 0], [1, 5, 8, 0, 1], [2, 6, 8, 0], [0, 8, 8, 8], [0, 9, 8, 12], [0, 0, 9, 8], [2, 1, 9, 0], [2, 3, 9, 0], [1, 6, 9, 0, 1], [0, 7, 9, 0], [0, 8, 9, 12], [0, 0, 10, 4], [0, 1, 10, 0], [1, 2, 10, 0, 1], [0, 3, 10, 0], [2, 4, 10, 0], [0, 3, 11, 0], [1, 4, 11, 0, 1], [0, 5, 11, 0], [0, 3, 12, 0], [1, 4, 12, 12, 1], [0, 5, 12, 0], [0, 6, 12, 12], [0, 7, 12, 12], [1, 8, 12, 12, 0], [0, 9, 12, 12], [1, 4, 13, 0, 0], [1, 5, 13, 0, 0], [1, 6, 13, 0, 0], [0, 7, 13, 0], [0, 9, 13, 0], [1, 2, 14, 0, 0], [2, 3, 14, 0], [2, 5, 14, 0], [2, 7, 14, 0], [0, 9, 14, 0], [2, 2, 15, 0], [2, 4, 15, 0], [2, 6, 15, 0], [2, 8, 15, 0], [0, 2, 16, 0], [0, 3, 16, 0], [0, 4, 16, 0], [0, 5, 16, 0], [0, 6, 16, 0], [0, 7, 16, 0], [0, 8, 16, 0], [0, 9, 16, 0]] }, "8-6": { w: 10, h: 13, e: [[0, 0, 0, 0], [0, 1, 0, 0], [0, 2, 0, 0], [0, 3, 0, 0], [0, 4, 0, 0], [0, 5, 0, 0], [2, 0, 1, 0], [2, 2, 1, 0], [2, 4, 1, 0], [0, 0, 2, 0], [2, 1, 2, 0], [0, 3, 2, 0], [1, 4, 2, 0, 1], [0, 5, 2, 0], [0, 6, 2, 12], [0, 7, 2, 12], [0, 0, 3, 0], [1, 1, 3, 0, 1], [0, 2, 3, 0], [0, 3, 3, 0], [2, 4, 3, 12], [1, 5, 3, 12, 1], [1, 7, 3, 0, 1], [1, 8, 3, 12, 0], [0, 9, 3, 12], [0, 0, 4, 0], [1, 1, 4, 12, 1], [0, 2, 4, 0], [1, 3, 4, 12, 0], [0, 5, 4, 12], [0, 6, 4, 4], [0, 7, 4, 4], [0, 8, 4, 8], [0, 9, 4, 0], [1, 1, 5, 0, 0], [0, 2, 5, 0], [0, 3, 5, 12], [1, 4, 5, 0, 0], [2, 5, 5, 0], [1, 7, 5, 0, 0], [0, 8, 5, 8], [0, 9, 5, 0], [0, 0, 6, 4], [0, 1, 6, 0], [1, 3, 6, 0, 1], [2, 4, 6, 0], [2, 6, 6, 0], [0, 8, 6, 8], [0, 9, 6, 0], [0, 0, 7, 0], [0, 1, 7, 4], [0, 2, 7, 4], [0, 3, 7, 8], [1, 4, 7, 0, 1], [0, 5, 7, 0], [0, 6, 7, 0], [0, 7, 7, 0], [0, 8, 7, 12], [0, 9, 7, 0], [2, 0, 8, 0], [0, 3, 8, 4], [0, 4, 8, 4], [0, 5, 8, 0], [0, 6, 8, 0], [0, 7, 8, 4], [0, 8, 8, 4], [0, 9, 8, 0], [0, 0, 9, 0], [2, 1, 9, 0], [1, 3, 9, 0, 0], [1, 4, 9, 0, 0], [2, 6, 9, 0], [2, 0, 10, 0], [0, 2, 10, 0], [2, 3, 10, 0], [2, 5, 10, 0], [0, 7, 10, 0], [0, 0, 11, 0], [0, 1, 11, 0], [2, 2, 11, 0], [2, 4, 11, 0], [2, 6, 11, 0], [0, 0, 12, 0], [0, 1, 12, 0], [0, 2, 12, 0], [0, 3, 12, 0], [0, 4, 12, 0], [0, 5, 12, 0], [0, 6, 12, 0], [0, 7, 12, 0]] }, "8-7": { w: 10, h: 16, e: [[0, 0, 0, 8], [0, 1, 0, 12], [0, 2, 0, 0], [0, 3, 0, 0], [0, 4, 0, 0], [0, 5, 0, 0], [0, 6, 0, 0], [0, 7, 0, 0], [0, 8, 0, 0], [0, 0, 1, 8], [2, 1, 1, 0], [2, 3, 1, 0], [2, 5, 1, 0], [2, 7, 1, 0], [0, 0, 2, 8], [1, 1, 2, 0, 1], [2, 2, 2, 0], [1, 4, 2, 0, 1], [1, 5, 2, 0, 1], [2, 6, 2, 0], [1, 8, 2, 0, 1], [0, 0, 3, 4], [2, 1, 3, 4], [0, 2, 3, 0], [0, 3, 3, 0], [1, 4, 3, 12, 1], [0, 6, 3, 0], [0, 7, 3, 0], [1, 8, 3, 12, 0], [0, 9, 3, 12], [0, 0, 4, 4], [0, 2, 4, 4], [0, 3, 4, 4], [0, 4, 4, 4], [0, 5, 4, 4], [0, 6, 4, 0], [0, 7, 4, 0], [0, 9, 4, 0], [0, 0, 5, 0], [1, 1, 5, 0, 0], [0, 2, 5, 8], [0, 3, 5, 12], [0, 4, 5, 12], [0, 5, 5, 12], [0, 6, 5, 12], [0, 7, 5, 0], [1, 8, 5, 0, 0], [0, 9, 5, 0], [0, 0, 6, 0], [0, 1, 6, 0], [0, 2, 6, 12], [1, 4, 6, 0, 0], [1, 5, 6, 0, 0], [2, 6, 6, 0], [2, 8, 6, 0], [0, 0, 7, 0], [2, 1, 7, 12], [0, 2, 7, 12], [0, 3, 7, 12], [2, 4, 7, 0], [0, 6, 7, 0], [1, 7, 7, 0, 1], [1, 8, 7, 0, 1], [0, 9, 7, 0], [0, 2, 8, 12], [1, 3, 8, 0, 1], [1, 4, 8, 0, 1], [0, 5, 8, 0], [0, 6, 8, 0], [0, 7, 8, 12], [0, 8, 8, 12], [0, 9, 8, 0], [0, 0, 9, 4], [1, 1, 9, 4, 0], [0, 2, 9, 0], [0, 3, 9, 4], [0, 4, 9, 4], [0, 5, 9, 0], [1, 6, 9, 4, 1], [2, 7, 9, 4], [0, 8, 9, 0], [0, 9, 9, 0], [0, 0, 10, 0], [2, 2, 10, 0], [0, 5, 10, 4], [0, 6, 10, 4], [0, 8, 10, 4], [0, 9, 10, 0], [0, 0, 11, 0], [0, 1, 11, 4], [0, 2, 11, 0], [0, 3, 11, 0], [1, 4, 11, 12, 1], [1, 5, 11, 0, 1], [1, 6, 11, 12, 0], [0, 7, 11, 12], [0, 8, 11, 12], [0, 9, 11, 12], [0, 0, 12, 0], [0, 1, 12, 0], [1, 2, 12, 12, 1], [1, 3, 12, 0, 0], [1, 4, 12, 0, 0], [1, 5, 12, 12, 0], [0, 6, 12, 12], [1, 7, 12, 0, 0], [1, 8, 12, 0, 0], [0, 9, 12, 0], [0, 0, 13, 0], [0, 1, 13, 12], [0, 2, 13, 12], [2, 3, 13, 0], [1, 5, 13, 0, 0], [0, 6, 13, 0], [2, 7, 13, 0], [0, 9, 13, 0], [2, 2, 14, 0], [2, 4, 14, 0], [2, 6, 14, 0], [2, 8, 14, 0], [0, 2, 15, 0], [0, 3, 15, 0], [0, 4, 15, 0], [0, 5, 15, 0], [0, 6, 15, 0], [0, 7, 15, 0], [0, 8, 15, 0], [0, 9, 15, 0]] }, "8-8": { w: 10, h: 11, e: [[0, 2, 0, 0], [0, 3, 0, 0], [0, 4, 0, 0], [0, 5, 0, 0], [0, 6, 0, 0], [0, 7, 0, 0], [0, 8, 0, 0], [0, 9, 0, 0], [2, 2, 1, 0], [2, 4, 1, 0], [2, 6, 1, 0], [2, 8, 1, 0], [0, 2, 2, 0], [2, 3, 2, 0], [0, 5, 2, 0], [0, 6, 2, 0], [1, 7, 2, 0, 1], [1, 8, 2, 0, 1], [0, 9, 2, 0], [0, 2, 3, 0], [1, 3, 3, 0, 1], [1, 4, 3, 0, 1], [0, 5, 3, 0], [0, 6, 3, 0], [0, 7, 3, 12], [0, 8, 3, 12], [0, 9, 3, 0], [0, 0, 4, 4], [1, 1, 4, 4, 0], [0, 2, 4, 0], [0, 3, 4, 4], [0, 4, 4, 4], [0, 5, 4, 0], [1, 6, 4, 4, 1], [2, 7, 4, 4], [0, 8, 4, 0], [0, 9, 4, 0], [0, 0, 5, 0], [0, 1, 5, 12], [2, 2, 5, 0], [0, 5, 5, 4], [0, 6, 5, 4], [0, 8, 5, 4], [0, 9, 5, 0], [0, 1, 6, 0], [0, 2, 6, 0], [0, 3, 6, 0], [1, 4, 6, 12, 1], [1, 5, 6, 0, 1], [1, 6, 6, 12, 0], [0, 7, 6, 12], [0, 8, 6, 12], [0, 9, 6, 12], [0, 1, 7, 0], [0, 2, 7, 0], [0, 3, 7, 12], [0, 4, 7, 12], [0, 5, 7, 12], [0, 6, 7, 12], [1, 7, 7, 0, 0], [1, 8, 7, 0, 0], [0, 9, 7, 0], [0, 1, 8, 0], [0, 2, 8, 12], [1, 3, 8, 0, 0], [1, 4, 8, 0, 0], [1, 5, 8, 0, 0], [0, 6, 8, 0], [2, 7, 8, 0], [0, 9, 8, 0], [2, 2, 9, 0], [2, 4, 9, 0], [2, 6, 9, 0], [2, 8, 9, 0], [0, 2, 10, 0], [0, 3, 10, 0], [0, 4, 10, 0], [0, 5, 10, 0], [0, 6, 10, 0], [0, 7, 10, 0], [0, 8, 10, 0], [0, 9, 10, 0]] }, "2-3": { w: 7, h: 5, e: [[0, 0, 0, 8], [0, 1, 0, 12], [0, 2, 0, 12], [0, 3, 0, 0], [0, 4, 0, 0], [0, 5, 0, 0], [0, 0, 1, 8], [2, 2, 1, 0], [2, 4, 1, 0], [0, 0, 2, 4], [2, 1, 2, 4], [0, 2, 2, 0], [2, 3, 2, 0], [0, 5, 2, 0], [0, 6, 2, 12], [1, 2, 3, 4, 0], [0, 3, 3, 0], [0, 4, 3, 0], [1, 5, 3, 4, 1], [0, 6, 3, 0], [0, 3, 4, 0], [0, 4, 4, 0]] } } };

// src/core/balancer.ts
var BELT = 0;
var UNDERGROUND = 1;
var SPLITTER = 2;
var SIZE = { [BELT]: [1, 1], [UNDERGROUND]: [1, 1], [SPLITTER]: [2, 1] };
var table = balancers_default.balancers;
function rotate(layout) {
  return {
    w: layout.h,
    h: layout.w,
    parts: layout.parts.map((part) => {
      const [w, h] = SIZE[part.kind];
      const [, height] = part.dir === 4 || part.dir === 12 ? [h, w] : [w, h];
      return { ...part, x: layout.h - part.y - height, y: part.x, dir: (part.dir + 4) % 16 };
    })
  };
}
function balancerSizes() {
  return Object.keys(table);
}
function hasBalancer(from, to) {
  return `${from}-${to}` in table;
}
var BALANCER_LIMIT = Object.keys(table).reduce((max, key3) => {
  const [from, to] = key3.split("-").map(Number);
  return Number.isFinite(from) && Number.isFinite(to) ? Math.max(max, from, to) : max;
}, 0);
function balancerLayout(from, to, dir) {
  const raw = table[`${from}-${to}`];
  if (!raw) return void 0;
  let layout = {
    w: raw.w,
    h: raw.h,
    parts: raw.e.map(([kind, x, y, direction, underground]) => ({
      kind,
      x,
      y,
      dir: direction,
      underground
    }))
  };
  const turns = (dir / 4 % 4 + 4) % 4;
  for (let i = 0; i < turns; i++) layout = rotate(layout);
  return layout;
}

// src/core/geometry.ts
var vec = (x, y) => ({ x, y });
var addVec = (a, b) => ({ x: a.x + b.x, y: a.y + b.y });
var Direction = {
  north: 0,
  northeast: 2,
  east: 4,
  southeast: 6,
  south: 8,
  southwest: 10,
  west: 12,
  northwest: 14
};
var DIRECTION_NAMES = Object.keys(Direction);
var DIRECTION_ALIASES = {
  n: "north",
  e: "east",
  s: "south",
  w: "west",
  ne: "northeast",
  se: "southeast",
  sw: "southwest",
  nw: "northwest",
  up: "north",
  right: "east",
  down: "south",
  left: "west"
};
function directionFromName(name) {
  if (name in Direction) return Direction[name];
  const canonical = DIRECTION_ALIASES[name];
  return canonical ? Direction[canonical] : void 0;
}
var DIRECTION_WORDS = [...DIRECTION_NAMES, ...Object.keys(DIRECTION_ALIASES)];
function directionName(dir) {
  return DIRECTION_NAMES.find((n) => Direction[n] === dir) ?? "north";
}
function directionStep(dir) {
  switch ((dir % 16 + 16) % 16) {
    case Direction.north:
      return vec(0, -1);
    case Direction.northeast:
      return vec(1, -1);
    case Direction.east:
      return vec(1, 0);
    case Direction.southeast:
      return vec(1, 1);
    case Direction.south:
      return vec(0, 1);
    case Direction.southwest:
      return vec(-1, 1);
    case Direction.west:
      return vec(-1, 0);
    default:
      return vec(-1, -1);
  }
}
function oppositeDirection(dir) {
  return (dir + 8) % 16;
}
function directionBetween(a, b) {
  if (a.x === b.x && a.y === b.y) return void 0;
  if (a.x === b.x) return b.y > a.y ? Direction.south : Direction.north;
  if (a.y === b.y) return b.x > a.x ? Direction.east : Direction.west;
  return void 0;
}
function rotateSize(size, dir) {
  const d = (dir % 16 + 16) % 16;
  return d === Direction.east || d === Direction.west ? vec(size.y, size.x) : vec(size.x, size.y);
}
function unionRect(a, b) {
  if (!a) return { ...b };
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  const right = Math.max(a.x + a.w, b.x + b.w);
  const bottom = Math.max(a.y + a.h, b.y + b.h);
  return { x, y, w: right - x, h: bottom - y };
}

// src/core/types.ts
var T = {
  int: { k: "int" },
  float: { k: "float" },
  bool: { k: "bool" },
  text: { k: "text" },
  coord: { k: "coord" },
  module: { k: "module" },
  handle: { k: "handle" },
  any: { k: "any" },
  void: { k: "void" },
  enum: (name) => ({ k: "enum", name }),
  array: (of) => ({ k: "array", of }),
  tuple: (items) => ({ k: "tuple", items })
};
var NAMED_TYPES = {
  int: T.int,
  float: T.float,
  number: T.float,
  bool: T.bool,
  text: T.text,
  coord: T.coord,
  direction: T.enum("direction"),
  tier: T.enum("tier"),
  quality: T.enum("quality"),
  recipe: T.enum("recipe"),
  item: T.enum("item"),
  module: T.module,
  entity: T.enum("entity"),
  handle: T.handle,
  any: T.any
};
function namedType(name) {
  return NAMED_TYPES[name];
}
function typeNames() {
  return Object.keys(NAMED_TYPES);
}
function showType(type) {
  switch (type.k) {
    case "enum":
      return type.name === "module-item" ? "item" : type.name;
    case "array":
      return `${showType(type.of)}[]`;
    case "tuple":
      return `(${type.items.map(showType).join(", ")})`;
    default:
      return type.k;
  }
}
function assignable(from, to) {
  if (to.k === "any" || from.k === "any") return true;
  if (from.k === to.k && from.k !== "enum" && from.k !== "array" && from.k !== "tuple") return true;
  if (from.k === "int" && to.k === "float") return true;
  if (from.k === "enum" && to.k === "enum") {
    if (from.name === "module-item" && to.name === "item") return true;
    return from.name === to.name;
  }
  if (to.k === "module") {
    if (from.k === "enum" && (from.name === "item" || from.name === "module-item")) return true;
    if (from.k === "module") return true;
    if (from.k === "tuple" && from.items.length === 2) {
      return assignable(from.items[0], T.enum("item")) && assignable(from.items[1], T.enum("quality"));
    }
    return false;
  }
  if (to.k === "coord") {
    if (from.k === "coord") return true;
    return from.k === "tuple" && from.items.length === 2 && from.items.every((t) => assignable(t, T.int));
  }
  if (to.k === "array") {
    if (from.k === "array") return assignable(from.of, to.of);
    if (from.k === "tuple" && from.items.every((t) => assignable(t, to.of))) return true;
    if (from.k === "coord" && assignable(T.int, to.of)) return true;
    return assignable(from, to.of);
  }
  if (to.k === "tuple" && from.k === "tuple") {
    return to.items.length === from.items.length && from.items.every((t, i) => assignable(t, to.items[i]));
  }
  return false;
}
var DIRECTIONS = DIRECTION_WORDS;
var TIERS = ["yellow", "red", "blue", "green", "normal", "basic", "fast", "express", "turbo"];
var UNDERGROUND_TYPES = ["input", "output"];
var ALIGNMENTS = ["start", "center", "end"];
var ROUTINGS = ["auto", "direct"];
var Universe = class _Universe {
  constructor(registry) {
    this.registry = registry;
    this.qualities = registry.qualities.length ? registry.qualities : ["normal"];
  }
  qualities;
  members(name) {
    switch (name) {
      case "direction":
        return DIRECTIONS;
      case "tier":
        return TIERS;
      case "quality":
        return this.qualities;
      case "underground-type":
        return UNDERGROUND_TYPES;
      case "align":
        return ALIGNMENTS;
      case "routing":
        return ROUTINGS;
      case "recipe":
        return [...this.registry.recipes.keys()];
      case "item":
        return [...this.registry.itemLabels.keys()];
      case "module-item":
        return [...this.registry.modules];
      case "entity":
        return [...this.registry.entities.keys()];
    }
  }
  isMember(name, value) {
    switch (name) {
      case "recipe":
        return this.registry.recipes.has(value);
      case "item":
        return this.registry.itemLabels.has(value);
      case "module-item":
        return this.registry.modules.has(value);
      case "entity":
        return this.registry.entities.has(value);
      default:
        return this.members(name).includes(value);
    }
  }
  /** The closed enums a bare name could belong to, in priority order. */
  static BARE = ["direction", "tier", "quality", "underground-type", "align", "routing"];
  /**
   * What a bare name means. The small vocabularies come first; after them a name is taken
   * as an item or a recipe only when it is not both — `iron-gear-wheel` is both, so it has
   * to be labelled and the label's type decides.
   */
  bareEnum(value) {
    const closed = _Universe.BARE.find((name) => this.isMember(name, value));
    if (closed) return closed;
    if (this.isMember("module-item", value)) return "module-item";
    const item = this.isMember("item", value);
    const recipe = this.isMember("recipe", value);
    if (item && !recipe) return "item";
    if (recipe && !item) return "recipe";
    return void 0;
  }
  /** True when a name exists in both namespaces and so cannot be used bare. */
  isAmbiguous(value) {
    return this.isMember("item", value) && this.isMember("recipe", value);
  }
};

// src/core/slots.ts
var DEFAULT_SLOT = {
  direction: "dir",
  tier: "tier",
  quality: "quality",
  "underground-type": "type",
  align: "align",
  routing: "route"
};
function defaultSlotFor(type) {
  if (type.k === "enum") return DEFAULT_SLOT[type.name];
  if (type.k === "coord") return "at";
  if (type.k === "tuple" && type.items.length === 2 && type.items.every((t) => t.k === "int")) return "at";
  return void 0;
}
function findSlot(slots, name) {
  return slots.find((slot) => slot.name === name || slot.aliases?.includes(name));
}
function bareSlot(slots, type) {
  const claimed = slots.find((slot) => slot.bare && assignable(type, slot.type));
  if (claimed) return claimed;
  const name = defaultSlotFor(type);
  return name ? findSlot(slots, name) : void 0;
}
var AT = { name: "at", type: T.coord, doc: "top-left tile of the footprint" };
var QUALITY = { name: "quality", type: T.enum("quality") };
function entitySlots(proto, supportsQuality) {
  const slots = [AT];
  if (proto.rotatable) {
    slots.push({ name: "dir", type: T.enum("direction"), doc: "the way it faces" });
  }
  if (proto.kind === "inserter") {
    slots.push({ name: "from", type: T.enum("direction"), doc: "the side it picks up from" });
  }
  if (proto.craftingSpeed !== void 0) {
    slots.push({ name: "recipe", type: T.enum("recipe") });
  }
  if (proto.moduleSlots > 0) {
    slots.push({ name: "modules", type: T.array(T.module) });
  }
  if (proto.kind === "underground-belt") {
    slots.push({ name: "type", type: T.enum("underground-type"), doc: "input or output end" });
  }
  if (supportsQuality) slots.push(QUALITY);
  return slots;
}
var BALANCER_SLOTS = [
  AT,
  { name: "in", type: T.int, aliases: ["from"], required: true, bare: true, doc: "input lanes, 1\u20138" },
  { name: "to", type: T.int, aliases: ["out"], required: true, doc: "output lanes, 1\u20138" },
  { name: "tier", type: T.enum("tier") },
  { name: "dir", type: T.enum("direction"), doc: "which way items flow" }
];
var HELPER_SLOTS = {
  belt: [
    { name: "from", type: T.coord, aliases: ["at"], doc: "where the run starts" },
    { name: "to", type: T.coord, doc: "where it ends" },
    { name: "via", type: T.array(T.coord), doc: "corners between from and to" },
    { name: "dir", type: T.enum("direction") },
    { name: "length", type: T.int },
    { name: "tier", type: T.enum("tier") },
    { name: "route", type: T.enum("routing"), doc: "auto tunnels under whatever is in the way" }
  ],
  underground: [
    { name: "from", type: T.coord, aliases: ["at"] },
    { name: "to", type: T.coord, required: true },
    { name: "tier", type: T.enum("tier") }
  ],
  balancer: BALANCER_SLOTS
};
var LAYOUT_SLOTS = {
  at: [{ name: "at", type: T.coord, required: true }],
  row: [
    { name: "gap", type: T.int },
    { name: "align", type: T.enum("align") }
  ],
  column: [
    { name: "gap", type: T.int },
    { name: "align", type: T.enum("align") }
  ]
};
function blockSlots(params, typeOf) {
  const taken = new Set(params.map((p) => p.name));
  const aliases = /* @__PURE__ */ new Map();
  for (const param of params) {
    const alias = param.array ? `${param.typeName}s` : param.typeName;
    if (taken.has(alias)) continue;
    if (params.filter((other) => (other.array ? `${other.typeName}s` : other.typeName) === alias).length > 1) continue;
    aliases.set(param.name, [alias]);
    taken.add(alias);
  }
  return [
    { name: "at", type: T.coord },
    ...params.map((param) => ({
      name: param.name,
      type: typeOf(param.typeName, param.array),
      aliases: aliases.get(param.name),
      required: param.required
    }))
  ];
}
var ANY_ENTITY_SLOTS = [
  AT,
  { name: "dir", type: T.enum("direction") },
  { name: "from", type: T.enum("direction") },
  { name: "recipe", type: T.enum("recipe") },
  { name: "modules", type: T.array(T.module) },
  { name: "type", type: T.enum("underground-type") },
  QUALITY
];
var FUNCTIONS = [
  { name: "repeat", params: [T.int, T.any], result: T.array(T.any) },
  { name: "count", params: [T.array(T.any)], result: T.int },
  { name: "min", params: [T.float], result: T.float, variadic: true, minArgs: 1 },
  { name: "max", params: [T.float], result: T.float, variadic: true, minArgs: 1 },
  { name: "abs", params: [T.float], result: T.float },
  { name: "floor", params: [T.float], result: T.int },
  { name: "ceil", params: [T.float], result: T.int },
  { name: "round", params: [T.float], result: T.int },
  { name: "ingredients", params: [T.enum("recipe")], result: T.array(T.enum("item")) },
  { name: "craft-time", params: [T.enum("recipe")], result: T.float },
  { name: "module-slots", params: [T.enum("item")], result: T.int },
  { name: "print", params: [T.any], result: T.void, variadic: true, minArgs: 1 }
];
function findFunction(name) {
  return FUNCTIONS.find((fn) => fn.name === name);
}

// src/core/args.ts
function argForm(arg, slots) {
  if (arg.label === void 0) return { expr: arg.value, loc: arg.loc };
  if (findSlot(slots, arg.label)) {
    return { slotName: arg.label, labelLoc: arg.labelLoc, expr: arg.value, loc: arg.loc };
  }
  if (arg.asCall) return { expr: arg.asCall, loc: arg.loc };
  return { slotName: arg.label, labelLoc: arg.labelLoc, expr: arg.value, loc: arg.loc };
}

// src/core/suggest.ts
function editDistance(a, b, limit) {
  if (Math.abs(a.length - b.length) > limit) return limit + 1;
  let twoBack = new Array(b.length + 1).fill(0);
  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  let current = new Array(b.length + 1);
  for (let i = 1; i <= a.length; i++) {
    current[0] = i;
    let best = current[0];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let value = Math.min(current[j - 1] + 1, previous[j] + 1, previous[j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        value = Math.min(value, twoBack[j - 2] + 1);
      }
      current[j] = value;
      best = Math.min(best, value);
    }
    if (best > limit) return limit + 1;
    const spare = twoBack;
    twoBack = previous;
    previous = current;
    current = spare;
  }
  return previous[b.length];
}
function closestNames(target, candidates, limit = 3) {
  const tolerance = Math.max(1, Math.floor(target.length / 4));
  const scored = [];
  for (const candidate of candidates) {
    if (candidate === target) continue;
    const distance = editDistance(target, candidate, tolerance);
    if (distance <= tolerance) scored.push({ name: candidate, distance });
  }
  return scored.sort((a, b) => a.distance - b.distance || a.name.length - b.name.length || a.name.localeCompare(b.name)).slice(0, limit).map((s) => s.name);
}

// src/core/check.ts
var DEFAULTABLE = {
  tier: T.enum("tier"),
  quality: T.enum("quality"),
  dir: T.enum("direction"),
  recipe: T.enum("recipe"),
  modules: T.array(T.module),
  gap: T.int,
  align: T.enum("align")
};
var HANDLE_FIELDS = {
  x: T.int,
  y: T.int,
  left: T.int,
  top: T.int,
  right: T.int,
  bottom: T.int,
  width: T.int,
  height: T.int,
  tiles: T.int,
  pos: T.coord,
  size: T.coord,
  center: T.coord,
  from: T.coord,
  to: T.coord,
  name: T.text,
  dir: T.enum("direction")
};
var Scope = class _Scope {
  constructor(parent) {
    this.parent = parent;
  }
  names = /* @__PURE__ */ new Map();
  get(name) {
    return this.names.get(name) ?? this.parent?.get(name);
  }
  set(name, type) {
    this.names.set(name, type);
  }
  child() {
    return new _Scope(this);
  }
  all() {
    return [...this.names.keys(), ...this.parent?.all() ?? []];
  }
};
var Checker = class {
  constructor(registry) {
    this.registry = registry;
    this.universe = new Universe(registry);
  }
  diagnostics = [];
  blocks = /* @__PURE__ */ new Map();
  universe;
  error(message, loc, hint) {
    this.diagnostics.push({ severity: "error", message, loc, hint });
  }
  warn(message, loc, hint) {
    this.diagnostics.push({ severity: "warning", message, loc, hint });
  }
  check(module) {
    const scope = new Scope();
    this.hoist(module.statements);
    this.checkStatements(module.statements, scope);
    return this.diagnostics;
  }
  /** Blocks are visible to each other regardless of order. */
  hoist(statements) {
    for (const statement of statements) {
      if (statement.kind !== "defblock") continue;
      if (this.blocks.has(statement.name)) {
        this.error(`block '${statement.name}' is defined twice`, statement.loc);
        continue;
      }
      this.blocks.set(statement.name, {
        name: statement.name,
        params: statement.params,
        slots: this.blockSlots(statement.params),
        loc: statement.loc
      });
    }
  }
  blockSlots(params) {
    return blockSlots(
      params.map((p) => ({
        name: p.name,
        typeName: p.type.name,
        array: p.type.array,
        required: p.default === void 0
      })),
      (name, array) => {
        const base = namedType(name) ?? T.any;
        return array ? T.array(base) : base;
      }
    );
  }
  resolveType(expr) {
    const base = namedType(expr.name);
    if (!base) {
      this.error(`unknown type '${expr.name}'`, expr.loc, this.suggestType(expr.name));
      return T.any;
    }
    return expr.array ? T.array(base) : base;
  }
  suggestType(name) {
    const near = closestNames(name, ["int", "float", "bool", "text", "coord", "direction", "tier", "quality", "recipe", "item", "module", "handle"], 1);
    return near.length ? `did you mean '${near[0]}'?` : void 0;
  }
  // ── Statements ──────────────────────────────────────────────────────────────
  checkStatements(statements, scope) {
    for (const statement of statements) this.checkStatement(statement, scope);
  }
  checkStatement(statement, scope) {
    switch (statement.kind) {
      case "defblock": {
        const inner = scope.child();
        for (const param of statement.params) {
          const type = this.resolveType(param.type);
          if (param.default) {
            const actual = this.typeOf(param.default, scope);
            if (!assignable(actual, type)) {
              this.error(
                `default for '${param.name}' is ${showType(actual)}, not ${showType(type)}`,
                param.default.loc
              );
            }
          }
          inner.set(param.name, type);
        }
        this.checkStatements(statement.body, inner);
        return;
      }
      case "def":
      case "assign": {
        const actual = this.typeOf(statement.value, scope);
        if (statement.type) {
          const declared = this.resolveType(statement.type);
          if (!assignable(actual, declared)) {
            this.error(
              `'${statement.name}' is declared ${showType(declared)} but the value is ${showType(actual)}`,
              statement.value.loc
            );
          }
          scope.set(statement.name, declared);
        } else {
          scope.set(statement.name, actual);
        }
        return;
      }
      case "defaults": {
        this.checkDefaults(statement, scope);
        return;
      }
      case "for": {
        const iterable = this.typeOf(statement.iterable, scope);
        let element = T.any;
        if (iterable.k === "array") element = iterable.of;
        else if (iterable.k === "tuple") element = iterable.items[0] ?? T.any;
        else if (iterable.k === "coord") element = T.int;
        else if (iterable.k !== "any") {
          this.error(`for needs something to iterate, got ${showType(iterable)}`, statement.iterable.loc, "try `0..n`");
        }
        const inner = scope.child();
        inner.set(statement.name, element);
        this.checkStatements(statement.body, inner);
        return;
      }
      case "if": {
        const condition = this.typeOf(statement.condition, scope);
        if (condition.k !== "bool" && condition.k !== "any") {
          this.error(`if needs a condition, got ${showType(condition)}`, statement.condition.loc);
        }
        this.checkStatements(statement.then, scope.child());
        if (statement.else) this.checkStatements(statement.else, scope.child());
        return;
      }
      case "block": {
        this.checkSlotArgs(statement.args, LAYOUT_SLOTS[statement.form], statement.form, scope, statement.loc);
        const inner = scope.child();
        if (statement.each) {
          const iterable = this.typeOf(statement.each.iterable, scope);
          const element = iterable.k === "array" ? iterable.of : iterable.k === "tuple" ? iterable.items[0] ?? T.any : T.any;
          if (iterable.k !== "array" && iterable.k !== "tuple" && iterable.k !== "any") {
            this.error(
              `${statement.form} for needs something to iterate, got ${showType(iterable)}`,
              statement.each.iterable.loc,
              "try `0..n`"
            );
          }
          inner.set(statement.each.name, element);
        }
        this.checkStatements(statement.body, inner);
        return;
      }
      case "expr":
        this.typeOf(statement.expr, scope);
    }
  }
  checkDefaults(statement, scope) {
    if (statement.target) {
      const known = this.registry.entities.has(statement.target) || statement.target in HELPER_SLOTS || [...this.registry.entities.values()].some((p) => p.kind === statement.target);
      if (!known) {
        this.error(
          `'${statement.target}' is not an entity or a family`,
          statement.targetLoc,
          this.suggestEntity(statement.target)
        );
      }
    }
    for (const arg of statement.args) {
      const form = argForm(arg, Object.keys(DEFAULTABLE).map((name) => ({ name, type: DEFAULTABLE[name] })));
      if (!form.slotName) {
        this.error("defaults needs `slot value` pairs", form.loc, `settable: ${Object.keys(DEFAULTABLE).join(", ")}`);
        continue;
      }
      if (statement.target) {
        const proto = this.registry.entities.get(statement.target);
        if (proto && !findSlot(entitySlots(proto, this.registry.profile.supportsQuality), form.slotName)) {
          this.warn(`${proto.label} has no '${form.slotName}' slot, so this default does nothing`, form.labelLoc);
        }
      }
      const expected = DEFAULTABLE[form.slotName];
      if (!expected) {
        this.error(
          `'${form.slotName}' cannot be defaulted`,
          form.labelLoc,
          `settable: ${Object.keys(DEFAULTABLE).join(", ")}`
        );
        continue;
      }
      const actual = this.typeOf(form.expr, scope, expected);
      if (!assignable(actual, expected)) {
        this.error(`${form.slotName} expects ${showType(expected)}, got ${showType(actual)}`, form.expr.loc);
      }
    }
    if (statement.body) this.checkStatements(statement.body, scope.child());
  }
  // ── Calls ───────────────────────────────────────────────────────────────────
  lookupCallee(name) {
    const block = this.blocks.get(name);
    if (block) return { kind: "block", slots: block.slots, name, params: block.params };
    const proto = this.registry.entities.get(name);
    if (proto) {
      return {
        kind: "entity",
        slots: entitySlots(proto, this.registry.profile.supportsQuality),
        name,
        label: proto.label,
        moduleSlots: proto.moduleSlots
      };
    }
    const helper = HELPER_SLOTS[name];
    if (helper) return { kind: "helper", slots: helper, name };
    return void 0;
  }
  suggestEntity(name) {
    const near = closestNames(name, [...this.registry.entities.keys(), ...this.blocks.keys()], 2);
    return near.length ? `did you mean ${near.map((n) => `'${n}'`).join(" or ")}?` : void 0;
  }
  checkSlotArgs(args, slots, calleeName, scope, loc) {
    const filled = /* @__PURE__ */ new Map();
    const fromBare = /* @__PURE__ */ new Set();
    for (const arg of args) {
      const form = argForm(arg, slots);
      let slot;
      if (form.slotName) {
        slot = findSlot(slots, form.slotName);
        if (!slot) {
          this.error(
            `'${calleeName}' has no slot '${form.slotName}'`,
            form.labelLoc,
            slots.length ? `it takes ${slots.map((s) => s.name).join(", ")}` : "it takes no arguments"
          );
          continue;
        }
      } else {
        if (form.expr.kind === "name" && !scope.get(form.expr.name)) {
          const named = findSlot(slots, form.expr.name);
          if (named) {
            this.error(
              `'${named.name}' has no value`,
              form.expr.loc,
              `${named.name} takes ${showType(named.type)}`
            );
            continue;
          }
        }
        const type = this.typeOf(form.expr, scope);
        slot = bareSlot(slots, type);
        if (slot) fromBare.add(slot.name);
        if (!slot) {
          this.error(
            `${showType(type)} needs a label here`,
            form.loc,
            slots.length ? `try one of ${slots.map((s) => s.name).join(", ")}` : void 0
          );
          continue;
        }
      }
      if (filled.has(slot.name)) {
        this.warn(`'${slot.name}' is given twice; the last one wins`, form.loc);
      }
      const actual = this.typeOf(form.expr, scope, slot.type);
      if (!assignable(actual, slot.type)) {
        this.error(`${slot.name} expects ${showType(slot.type)}, got ${showType(actual)}`, form.expr.loc);
      }
      filled.set(slot.name, form.expr);
    }
    for (const slot of slots) {
      if (slot.required && !filled.has(slot.name)) {
        this.error(`'${calleeName}' needs ${slot.name}`, loc, this.missingHint(slot, fromBare));
      }
    }
    return filled;
  }
  /**
   * Why a required slot went unfilled. The common surprise is a coordinate: an unlabelled one
   * always means position, so it lands in `at` and any other coordinate parameter stays empty.
   */
  missingHint(slot, fromBare) {
    if (slot.type.k === "coord" && fromBare.has("at")) {
      return `an unlabelled coordinate fills 'at'; write '${slot.name} (x, y)' to reach this one`;
    }
    return `${slot.name} takes ${showType(slot.type)}`;
  }
  /** Everything the game data lets us decide before a single entity is placed. */
  checkGameRules(callee, filled, loc) {
    if (callee.kind !== "entity") return;
    const recipeExpr = filled.get("recipe");
    if (recipeExpr && recipeExpr.kind === "name") {
      const recipe = this.registry.recipes.get(recipeExpr.name);
      if (recipe?.producers && !recipe.producers.includes(callee.name)) {
        this.error(
          `${callee.label} cannot craft ${recipeExpr.name}`,
          recipeExpr.loc,
          `it is made in ${recipe.producers.slice(0, 3).join(", ")}`
        );
      }
    }
    const modulesExpr = filled.get("modules");
    if (modulesExpr?.kind === "tuple" && modulesExpr.items.length > callee.moduleSlots) {
      this.error(
        `${callee.label} has ${callee.moduleSlots} module slot(s), ${modulesExpr.items.length} given`,
        modulesExpr.loc
      );
    }
    void loc;
  }
  // ── Expressions ─────────────────────────────────────────────────────────────
  typeOf(expr, scope, expected) {
    switch (expr.kind) {
      case "number":
        return Number.isInteger(expr.value) ? T.int : T.float;
      case "text":
        return T.text;
      case "name":
        return this.typeOfName(expr.name, expr.loc, scope, expected);
      case "tuple":
        return T.tuple(expr.items.map((item) => this.typeOf(item, scope, elementOf(expected))));
      case "range": {
        for (const side of [expr.from, expr.to]) {
          const type = this.typeOf(side, scope);
          if (type.k !== "int" && type.k !== "any") {
            this.error(`a range needs whole numbers, got ${showType(type)}`, side.loc);
          }
        }
        return T.array(T.int);
      }
      case "unary": {
        const operand = this.typeOf(expr.operand, scope);
        if (expr.op === "not") return T.bool;
        if (operand.k !== "int" && operand.k !== "float" && operand.k !== "any") {
          this.error(`cannot negate ${showType(operand)}`, expr.loc);
        }
        return operand;
      }
      case "binary":
        return this.typeOfBinary(expr, scope);
      case "field":
        return this.typeOfField(expr, scope);
      case "measure":
        this.typeOf(expr.body, scope);
        return T.handle;
      case "call":
        return this.typeOfCall(expr, scope);
    }
  }
  typeOfName(name, loc, scope, expected) {
    const bound = scope.get(name);
    if (bound) return bound;
    if (expected) {
      const target = expected.k === "array" ? expected.of : expected;
      if (target.k === "enum" && target.name === "entity" && this.blocks.has(name)) return target;
      if (target.k === "enum" && this.universe.isMember(target.name, name)) return target;
      if (target.k === "module" && (this.universe.isMember("item", name) || this.universe.isMember("module-item", name))) {
        return T.module;
      }
      if (target.k === "enum") {
        const candidates = target.name === "entity" ? [...this.universe.members("entity"), ...this.blocks.keys()] : this.universe.members(target.name);
        const near2 = closestNames(name, candidates, 2);
        this.error(
          `'${name}' is not a ${target.name}`,
          loc,
          near2.length ? `did you mean ${near2.map((n) => `'${n}'`).join(" or ")}?` : void 0
        );
        return T.any;
      }
    }
    const bare = this.universe.bareEnum(name);
    if (bare) return T.enum(bare);
    const near = closestNames(name, [...scope.all(), ...this.blocks.keys(), ...this.registry.entities.keys()], 2);
    this.error(
      `unknown name '${name}'`,
      loc,
      near.length ? `did you mean ${near.map((n) => `'${n}'`).join(" or ")}?` : void 0
    );
    return T.any;
  }
  typeOfBinary(expr, scope) {
    const left = this.typeOf(expr.left, scope);
    const right = this.typeOf(expr.right, scope);
    if (expr.op === "and" || expr.op === "or") return T.bool;
    if (["==", "!=", "<", "<=", ">", ">="].includes(expr.op)) return T.bool;
    for (const [type, side] of [
      [left, expr.left],
      [right, expr.right]
    ]) {
      if (type.k !== "int" && type.k !== "float" && type.k !== "any") {
        this.error(`'${expr.op}' needs numbers, got ${showType(type)}`, side.loc);
      }
    }
    if (expr.op === "/") return T.float;
    return left.k === "float" || right.k === "float" ? T.float : T.int;
  }
  typeOfField(expr, scope) {
    const target = this.typeOf(expr.target, scope);
    if (target.k === "coord" || target.k === "tuple" && target.items.length === 2) {
      if (expr.field === "x" || expr.field === "y") return T.int;
      this.error(`a coordinate has only .x and .y, not .${expr.field}`, expr.loc);
      return T.any;
    }
    if (target.k === "handle" || target.k === "any") {
      const field = HANDLE_FIELDS[expr.field];
      if (field) return field;
      const near = closestNames(expr.field, Object.keys(HANDLE_FIELDS), 2);
      this.error(
        `no field '.${expr.field}'`,
        expr.loc,
        near.length ? `did you mean ${near.map((n) => `.${n}`).join(" or ")}?` : void 0
      );
      return T.any;
    }
    this.error(`${showType(target)} has no fields`, expr.loc);
    return T.any;
  }
  typeOfCall(expr, scope) {
    const fn = findFunction(expr.callee);
    if (fn) {
      const labelled = expr.args.find((arg) => arg.label !== void 0 && !arg.asCall);
      if (labelled) this.error(`'${fn.name}' takes plain values, not labels`, labelled.labelLoc);
      const min = fn.minArgs ?? fn.params.length;
      const max = fn.variadic ? Infinity : fn.params.length;
      if (expr.args.length < min || expr.args.length > max) {
        this.error(
          `'${fn.name}' takes ${fn.variadic ? `at least ${min}` : min} argument(s), got ${expr.args.length}`,
          expr.loc
        );
      }
      expr.args.forEach((arg, index) => {
        const want = fn.params[Math.min(index, fn.params.length - 1)] ?? T.any;
        const got = this.typeOf(arg.value, scope, want);
        if (!assignable(got, want)) {
          this.error(`'${fn.name}' argument ${index + 1} expects ${showType(want)}, got ${showType(got)}`, arg.value.loc);
        }
      });
      if (fn.name === "repeat" && expr.args[1]) return T.array(this.typeOf(expr.args[1].value, scope));
      return fn.result;
    }
    const bound = scope.get(expr.callee);
    if (bound?.k === "enum" && bound.name === "entity") {
      this.checkSlotArgs(expr.args, ANY_ENTITY_SLOTS, expr.callee, scope, expr.loc);
      return T.handle;
    }
    const callee = this.lookupCallee(expr.callee);
    if (!callee) {
      this.error(`unknown name '${expr.callee}'`, expr.loc, this.suggestEntity(expr.callee));
      expr.args.forEach((arg) => this.typeOf(arg.value, scope));
      return T.any;
    }
    const filled = this.checkSlotArgs(expr.args, callee.slots, expr.callee, scope, expr.loc);
    this.checkGameRules(callee, filled, expr.loc);
    if (expr.callee === "balancer") {
      const from = filled.get("in");
      const to = filled.get("to");
      if (from?.kind === "number" && to?.kind === "number" && !hasBalancer(from.value, to.value)) {
        this.error(
          `there is no ${from.value} to ${to.value} balancer in the library`,
          expr.loc,
          `inputs and outputs both run from 1 to ${BALANCER_LIMIT}`
        );
      }
    }
    return T.handle;
  }
};
function elementOf(type) {
  if (!type) return void 0;
  if (type.k === "array") return type.of;
  if (type.k === "coord") return T.int;
  return void 0;
}
function check(module, registry) {
  return new Checker(registry).check(module);
}

// src/core/cost.ts
var IGNORED_FLAGS = /* @__PURE__ */ new Set(["recycling", "technology", "burn"]);
var indexes = /* @__PURE__ */ new WeakMap();
function indexOf(registry) {
  const cached = indexes.get(registry);
  if (cached) return cached;
  const producers = /* @__PURE__ */ new Map();
  const raw = /* @__PURE__ */ new Set();
  for (const recipe of registry.recipes.values()) {
    const flags = new Set(recipe.flags ?? []);
    const mined = flags.has("mining");
    if ([...flags].some((f) => IGNORED_FLAGS.has(f))) continue;
    const madeFromNothing = Object.keys(recipe.in ?? {}).length === 0;
    for (const item of Object.keys(recipe.out ?? {})) {
      if (mined || madeFromNothing) raw.add(item);
      const list = producers.get(item);
      if (list) list.push(recipe);
      else producers.set(item, [recipe]);
    }
  }
  const index = { producers, raw };
  indexes.set(registry, index);
  return index;
}
function recipeFor(index, item) {
  const options = index.producers.get(item);
  if (!options?.length) return void 0;
  return options.find((recipe) => recipe.id === item) ?? options[0];
}
function rawOf(item, index, memo, visiting, unresolved) {
  const done = memo.get(item);
  if (done) return done;
  const single = /* @__PURE__ */ new Map();
  if (index.raw.has(item) || visiting.has(item)) {
    single.set(item, 1);
    memo.set(item, single);
    return single;
  }
  const recipe = recipeFor(index, item);
  if (!recipe) {
    unresolved.add(item);
    single.set(item, 1);
    memo.set(item, single);
    return single;
  }
  const produced = recipe.out?.[item] ?? 1;
  visiting.add(item);
  for (const [ingredient, count] of Object.entries(recipe.in ?? {})) {
    const per = count / produced;
    for (const [resource, amount] of rawOf(ingredient, index, memo, visiting, unresolved)) {
      single.set(resource, (single.get(resource) ?? 0) + amount * per);
    }
  }
  visiting.delete(item);
  memo.set(item, single);
  return single;
}
var byAmount = (a, b) => b.amount - a.amount || a.item.localeCompare(b.item);
function computeCost(scene, registry) {
  const bill = /* @__PURE__ */ new Map();
  const add = (item, count = 1) => bill.set(item, (bill.get(item) ?? 0) + count);
  for (const entity of scene.entities) {
    add(entity.proto.name);
    for (const module of entity.modules ?? []) add(module.name);
  }
  const index = indexOf(registry);
  const memo = /* @__PURE__ */ new Map();
  const unresolved = /* @__PURE__ */ new Set();
  const raw = /* @__PURE__ */ new Map();
  for (const [item, count] of bill) {
    for (const [resource, amount] of rawOf(item, index, memo, /* @__PURE__ */ new Set(), unresolved)) {
      raw.set(resource, (raw.get(resource) ?? 0) + amount * count);
    }
  }
  return {
    items: [...bill].map(([item, amount]) => ({ item, amount })).sort(byAmount),
    raw: [...raw].map(([item, amount]) => ({ item, amount })).sort(byAmount),
    unresolved: [...unresolved].sort()
  };
}

// src/core/errors.ts
var LangError = class extends Error {
  constructor(message, loc, hint) {
    super(message);
    this.loc = loc;
    this.hint = hint;
    this.name = "LangError";
  }
};
function fail(message, loc, hint) {
  throw new LangError(message, loc, hint);
}

// src/core/ast.ts
var BLOCK_FORMS = /* @__PURE__ */ new Set(["at", "row", "column"]);

// src/core/lexer.ts
var PUNCTUATION = ["=>", "==", "!=", "<=", ">=", "..", "[]", "(", ")", "{", "}", ",", "=", ".", "+", "-", "*", "/", "%", "<", ">"];
var IDENT_START = /[A-Za-z_]/;
var IDENT_REST = /[A-Za-z0-9_?!-]/;
function tokenize(source) {
  const tokens = [];
  let i = 0;
  let line = 1;
  let col = 1;
  let parenDepth = 0;
  const here = () => ({ line, col });
  const advance = (n = 1) => {
    for (let k = 0; k < n; k++) {
      if (source[i] === "\n") {
        line++;
        col = 1;
      } else {
        col++;
      }
      i++;
    }
  };
  const push = (kind, text, loc) => tokens.push({ kind, text, loc });
  while (i < source.length) {
    const ch = source[i];
    if (ch === "\n") {
      const loc = here();
      advance();
      if (parenDepth === 0 && tokens.length > 0 && tokens[tokens.length - 1].kind !== "newline") {
        push("newline", "\n", loc);
      }
      continue;
    }
    if (ch === " " || ch === "	" || ch === "\r") {
      advance();
      continue;
    }
    if (ch === ";") {
      while (i < source.length && source[i] !== "\n") advance();
      continue;
    }
    if (ch === '"') {
      const loc = here();
      advance();
      let text = "";
      while (i < source.length && source[i] !== '"') {
        if (source[i] === "\\") {
          const escape = source[i + 1];
          text += escape === "n" ? "\n" : escape === "t" ? "	" : escape ?? "";
          advance(2);
        } else {
          text += source[i];
          advance();
        }
      }
      if (i >= source.length) fail("unterminated string", loc);
      advance();
      push("string", text, loc);
      continue;
    }
    if (/[0-9]/.test(ch)) {
      const loc = here();
      let text = "";
      while (i < source.length && /[0-9]/.test(source[i])) {
        text += source[i];
        advance();
      }
      if (source[i] === "." && /[0-9]/.test(source[i + 1] ?? "")) {
        text += ".";
        advance();
        while (i < source.length && /[0-9]/.test(source[i])) {
          text += source[i];
          advance();
        }
      }
      push("number", text, loc);
      continue;
    }
    if (IDENT_START.test(ch)) {
      const loc = here();
      let text = "";
      while (i < source.length && IDENT_REST.test(source[i])) {
        text += source[i];
        advance();
      }
      push("ident", text, loc);
      continue;
    }
    const punct = PUNCTUATION.find((p) => source.startsWith(p, i));
    if (punct) {
      const loc = here();
      if (punct === "(") parenDepth++;
      if (punct === ")") parenDepth = Math.max(0, parenDepth - 1);
      advance(punct.length);
      push("punct", punct, loc);
      continue;
    }
    fail(`unexpected character '${ch}'`, here());
  }
  if (tokens.length && tokens[tokens.length - 1].kind === "newline") tokens.pop();
  push("eof", "", here());
  return tokens;
}

// src/core/parser.ts
var PRECEDENCE = {
  or: 1,
  and: 2,
  "==": 3,
  "!=": 3,
  "<": 4,
  "<=": 4,
  ">": 4,
  ">=": 4,
  "+": 5,
  "-": 5,
  "*": 6,
  "/": 6,
  "%": 6
};
var RESERVED = /* @__PURE__ */ new Set(["defblock", "def", "defaults", "for", "in", "if", "else", "and", "or", "not", "measure"]);
var Parser = class {
  constructor(tokens) {
    this.tokens = tokens;
  }
  pos = 0;
  // ── Token helpers ───────────────────────────────────────────────────────────
  peek(offset = 0) {
    return this.tokens[Math.min(this.pos + offset, this.tokens.length - 1)];
  }
  at(text, offset = 0) {
    const token = this.peek(offset);
    return (token.kind === "punct" || token.kind === "ident") && token.text === text;
  }
  next() {
    return this.tokens[this.pos++] ?? this.tokens[this.tokens.length - 1];
  }
  expect(text, context) {
    if (!this.at(text)) {
      const found = this.peek();
      fail(
        `expected '${text}' ${context}, found ${found.kind === "newline" ? "end of line" : `'${found.text}'`}`,
        found.loc
      );
    }
    return this.next();
  }
  skipNewlines() {
    while (this.peek().kind === "newline") this.pos++;
  }
  /** After an operator or a comma, a line break is a continuation, not a terminator. */
  skipSoftNewlines() {
    this.skipNewlines();
  }
  startsExpression(offset = 0) {
    const token = this.peek(offset);
    if (token.kind === "number" || token.kind === "string") return true;
    if (token.kind === "ident") return !RESERVED.has(token.text) || token.text === "not" || token.text === "measure";
    return token.kind === "punct" && (token.text === "(" || token.text === "-");
  }
  // ── Module ──────────────────────────────────────────────────────────────────
  parseModule() {
    const statements = [];
    this.skipNewlines();
    while (this.peek().kind !== "eof") {
      statements.push(this.parseStatement());
      this.skipNewlines();
    }
    return { statements };
  }
  parseBody() {
    this.expect("{", "to open a block");
    const statements = [];
    this.skipNewlines();
    while (!this.at("}") && this.peek().kind !== "eof") {
      statements.push(this.parseStatement());
      this.skipNewlines();
    }
    this.expect("}", "to close a block");
    return statements;
  }
  parseArrow() {
    this.skipNewlines();
    this.expect("=>", "before a block body");
    this.skipNewlines();
    return this.parseBody();
  }
  // ── Statements ──────────────────────────────────────────────────────────────
  parseStatement() {
    const token = this.peek();
    const loc = token.loc;
    if (token.kind === "ident") {
      switch (token.text) {
        case "defblock":
          return this.parseDefblock();
        case "def":
          return this.parseDef();
        case "defaults":
          return this.parseDefaults();
        case "for":
          return this.parseFor();
        case "if":
          return this.parseIf();
      }
      if (BLOCK_FORMS.has(token.text) && this.isBlockForm()) {
        this.next();
        const args = token.text === "at" ? [{ label: "at", labelLoc: loc, value: this.parsePrimary(), loc }] : this.at("(") ? this.parseArgList() : [];
        let each;
        if (token.text !== "at" && this.at("for")) {
          this.next();
          const name = this.expectIdent("a loop variable");
          this.expect("in", "in a for header");
          this.skipSoftNewlines();
          each = { name, iterable: this.parseExpr() };
        }
        const body = this.parseArrow();
        return { kind: "block", form: token.text, args, each, body, loc };
      }
      const typed = this.tryParseTypedLocal();
      if (typed) return typed;
      if (this.peek(1).kind === "punct" && this.peek(1).text === "=") {
        const name = this.next().text;
        this.next();
        this.skipSoftNewlines();
        return { kind: "assign", name, value: this.parseExpr(), loc };
      }
    }
    return { kind: "expr", expr: this.parseExpr(), loc };
  }
  /** `at`, `row` and `column` are block forms only when a `=> {` follows their arguments. */
  isBlockForm() {
    if (this.at("=>", 1)) return true;
    if (this.at("for", 1)) return true;
    if (!this.at("(", 1)) return false;
    let depth = 0;
    for (let i = 1; ; i++) {
      const token = this.peek(i);
      if (token.kind === "eof") return false;
      if (token.kind !== "punct") continue;
      if (token.text === "(") depth++;
      else if (token.text === ")") {
        depth--;
        if (depth === 0) return this.at("=>", i + 1) || this.at("for", i + 1);
      }
    }
  }
  /** `coord f = (…)` and `module[] m = ()` — a declared type in front of a local name. */
  tryParseTypedLocal() {
    const start = this.pos;
    const loc = this.peek().loc;
    if (this.peek().kind !== "ident" || RESERVED.has(this.peek().text)) return null;
    const typeName = this.peek().text;
    const array = this.at("[]", 1);
    const nameIndex = array ? 2 : 1;
    const eqIndex = nameIndex + 1;
    if (this.peek(nameIndex).kind !== "ident") return null;
    if (!this.at("=", eqIndex)) return null;
    this.pos = start + eqIndex + 1;
    const type = { name: typeName, array, loc };
    const name = this.tokens[start + nameIndex].text;
    this.skipSoftNewlines();
    return { kind: "assign", name, type, value: this.parseExpr(), loc };
  }
  parseDefblock() {
    const loc = this.next().loc;
    const name = this.expectIdent("a block name");
    const params = this.parseParams();
    const body = this.parseArrow();
    return { kind: "defblock", name, params, body, loc };
  }
  parseDef() {
    const loc = this.next().loc;
    let type;
    if (this.peek().kind === "ident" && this.at("=", 1) === false && this.peek(1).kind === "ident") {
      const typeName = this.next().text;
      type = { name: typeName, array: false, loc };
    } else if (this.peek().kind === "ident" && this.at("[]", 1)) {
      const typeName = this.next().text;
      this.next();
      type = { name: typeName, array: true, loc };
    }
    const name = this.expectIdent("a name after def");
    this.expect("=", "in a def");
    this.skipSoftNewlines();
    return { kind: "def", name, type, value: this.parseExpr(), loc };
  }
  parseDefaults() {
    const loc = this.next().loc;
    let target;
    let targetLoc;
    if (this.peek().kind === "ident" && !RESERVED.has(this.peek().text)) {
      targetLoc = this.peek().loc;
      target = this.next().text;
    }
    const args = this.parseArgList();
    const body = this.at("=>") || this.peek().kind === "newline" ? void 0 : void 0;
    if (this.at("=>")) {
      return { kind: "defaults", target, targetLoc, args, body: this.parseArrow(), loc };
    }
    return { kind: "defaults", target, targetLoc, args, body, loc };
  }
  parseFor() {
    const loc = this.next().loc;
    const name = this.expectIdent("a loop variable");
    this.expect("in", "in a for statement");
    this.skipSoftNewlines();
    const iterable = this.parseExpr();
    const body = this.parseArrow();
    return { kind: "for", name, iterable, body, loc };
  }
  parseIf() {
    const loc = this.next().loc;
    const condition = this.parseExpr();
    const then = this.parseArrow();
    this.skipNewlines();
    if (this.at("else")) {
      this.next();
      return { kind: "if", condition, then, else: this.parseArrow(), loc };
    }
    return { kind: "if", condition, then, loc };
  }
  expectIdent(what) {
    const token = this.peek();
    if (token.kind !== "ident") fail(`expected ${what}, found '${token.text || "end of input"}'`, token.loc);
    return this.next().text;
  }
  // ── Parameters ──────────────────────────────────────────────────────────────
  parseParams() {
    this.expect("(", "to open a parameter list");
    const params = [];
    this.skipNewlines();
    while (!this.at(")") && this.peek().kind !== "eof") {
      const loc = this.peek().loc;
      const typeName = this.expectIdent("a parameter type");
      const array = this.at("[]");
      if (array) this.next();
      const name = this.expectIdent("a parameter name");
      let fallback;
      if (this.at("=")) {
        this.next();
        this.skipSoftNewlines();
        fallback = this.parseExpr();
      }
      params.push({ type: { name: typeName, array, loc }, name, default: fallback, loc });
      if (this.at(",")) this.next();
      this.skipNewlines();
    }
    this.expect(")", "to close a parameter list");
    return params;
  }
  // ── Arguments ───────────────────────────────────────────────────────────────
  parseArgList() {
    this.expect("(", "to open an argument list");
    const args = [];
    this.skipNewlines();
    while (!this.at(")") && this.peek().kind !== "eof") {
      args.push(this.parseArg());
      this.skipNewlines();
      if (this.at(",")) {
        this.next();
        this.skipNewlines();
      }
    }
    this.expect(")", "to close an argument list");
    return args;
  }
  /**
   * `tier blue` is a label and its value; `blue` alone finds its slot from its type.
   * `repeat (4, x)` is ambiguous between the two, so both readings are recorded and the
   * checker picks whichever the callee actually has — a slot or a function in scope.
   */
  parseArg() {
    const token = this.peek();
    if (token.kind === "ident" && !RESERVED.has(token.text) && this.startsExpression(1)) {
      const labelLoc = token.loc;
      const label = this.next().text;
      const value2 = this.parseExpr();
      const arg = { label, labelLoc, value: value2, loc: labelLoc };
      if (value2.kind === "tuple") {
        arg.asCall = { kind: "call", callee: label, args: value2.items.map((v) => ({ value: v, loc: v.loc })), loc: labelLoc };
      }
      return arg;
    }
    const value = this.parseExpr();
    return { value, loc: value.loc };
  }
  // ── Expressions ─────────────────────────────────────────────────────────────
  parseExpr(minPrecedence = 0) {
    let left = this.parseUnary();
    for (; ; ) {
      const token = this.peek();
      if (token.kind === "punct" && token.text === ".." && minPrecedence === 0) {
        this.next();
        this.skipSoftNewlines();
        left = { kind: "range", from: left, to: this.parseExpr(1), loc: left.loc };
        continue;
      }
      const op = token.kind === "punct" || token.kind === "ident" ? token.text : "";
      const precedence = PRECEDENCE[op];
      if (precedence === void 0 || precedence < minPrecedence) break;
      this.next();
      this.skipSoftNewlines();
      const right = this.parseExpr(precedence + 1);
      left = { kind: "binary", op, left, right, loc: token.loc };
    }
    return left;
  }
  parseUnary() {
    const token = this.peek();
    if (token.kind === "punct" && token.text === "-" || token.kind === "ident" && token.text === "not") {
      this.next();
      return { kind: "unary", op: token.text, operand: this.parseUnary(), loc: token.loc };
    }
    return this.parsePostfix();
  }
  parsePostfix() {
    let expr = this.parsePrimary();
    while (this.at(".")) {
      const loc = this.next().loc;
      expr = { kind: "field", target: expr, field: this.expectIdent("a field name"), loc };
    }
    return expr;
  }
  parsePrimary() {
    const token = this.peek();
    if (token.kind === "number") {
      this.next();
      return { kind: "number", value: Number(token.text), loc: token.loc };
    }
    if (token.kind === "string") {
      this.next();
      return { kind: "text", value: token.text, loc: token.loc };
    }
    if (token.kind === "ident") {
      if (token.text === "measure") {
        this.next();
        this.expect("(", "after measure");
        this.skipNewlines();
        const body = this.parseExpr();
        this.skipNewlines();
        this.expect(")", "to close measure");
        return { kind: "measure", body, loc: token.loc };
      }
      if (RESERVED.has(token.text)) fail(`'${token.text}' cannot be used here`, token.loc);
      this.next();
      if (this.at("(")) {
        return { kind: "call", callee: token.text, args: this.parseArgList(), loc: token.loc };
      }
      return { kind: "name", name: token.text, loc: token.loc };
    }
    if (token.kind === "punct" && token.text === "(") {
      this.next();
      this.skipNewlines();
      const items = [];
      let sawComma = false;
      while (!this.at(")") && this.peek().kind !== "eof") {
        items.push(this.parseExpr());
        this.skipNewlines();
        if (this.at(",")) {
          sawComma = true;
          this.next();
          this.skipNewlines();
        }
      }
      this.expect(")", "to close a group");
      if (items.length === 1 && !sawComma) return items[0];
      return { kind: "tuple", items, loc: token.loc };
    }
    fail(
      token.kind === "newline" ? "unexpected end of line" : `unexpected '${token.text || "end of input"}'`,
      token.loc
    );
  }
};
function parse(source) {
  return new Parser(tokenize(source)).parseModule();
}

// src/core/power.ts
var key = (x, y) => `${x},${y}`;
function span(start, size, reach) {
  const centre = start + size / 2;
  return [Math.floor(centre - reach), Math.ceil(centre + reach)];
}
function powerCoverage(entities) {
  const covered = /* @__PURE__ */ new Set();
  let poles = 0;
  for (const entity of entities) {
    const reach = entity.proto.supplyArea;
    if (reach === void 0) continue;
    poles++;
    const [left, right] = span(entity.x, entity.w, reach);
    const [top, bottom] = span(entity.y, entity.h, reach);
    for (let x = left; x < right; x++) {
      for (let y = top; y < bottom; y++) covered.add(key(x, y));
    }
  }
  const unpowered = [];
  let consumers = 0;
  for (const entity of entities) {
    if (!entity.proto.needsPower) continue;
    consumers++;
    let reached = false;
    for (let dx = 0; dx < entity.w && !reached; dx++) {
      for (let dy = 0; dy < entity.h && !reached; dy++) {
        if (covered.has(key(entity.x + dx, entity.y + dy))) reached = true;
      }
    }
    if (!reached) unpowered.push(entity);
  }
  return { covered, unpowered, poles, consumers };
}

// src/data/entity-geometry.ts
var belt = (kind, size = [1, 1]) => ({
  size,
  rotatable: true,
  kind
});
var ENTITY_GEOMETRY = {
  // ── Belts ────────────────────────────────────────────────────────────────────
  "transport-belt": belt("belt"),
  "fast-transport-belt": belt("belt"),
  "express-transport-belt": belt("belt"),
  "turbo-transport-belt": belt("belt"),
  "underground-belt": { ...belt("underground-belt"), undergroundReach: 4 },
  "fast-underground-belt": { ...belt("underground-belt"), undergroundReach: 6 },
  "express-underground-belt": { ...belt("underground-belt"), undergroundReach: 8 },
  "turbo-underground-belt": { ...belt("underground-belt"), undergroundReach: 10 },
  splitter: belt("splitter", [2, 1]),
  "fast-splitter": belt("splitter", [2, 1]),
  "express-splitter": belt("splitter", [2, 1]),
  "turbo-splitter": belt("splitter", [2, 1]),
  loader: belt("belt"),
  "fast-loader": belt("belt"),
  "express-loader": belt("belt"),
  "turbo-loader": belt("belt"),
  // ── Inserters ────────────────────────────────────────────────────────────────
  "burner-inserter": belt("inserter"),
  inserter: { ...belt("inserter"), powered: true },
  "long-handed-inserter": { ...belt("inserter"), powered: true },
  "fast-inserter": { ...belt("inserter"), powered: true },
  "bulk-inserter": { ...belt("inserter"), powered: true },
  "stack-inserter": { ...belt("inserter"), powered: true },
  // ── Power ────────────────────────────────────────────────────────────────────
  "small-electric-pole": { size: [1, 1], kind: "pole", supplyArea: 2.5 },
  "medium-electric-pole": { size: [1, 1], kind: "pole", supplyArea: 3.5 },
  "big-electric-pole": { size: [2, 2], kind: "pole", supplyArea: 2 },
  substation: { size: [2, 2], kind: "pole", supplyArea: 9 },
  "solar-panel": { size: [3, 3], kind: "machine" },
  accumulator: { size: [2, 2], kind: "machine" },
  boiler: { size: [3, 2], rotatable: true, kind: "machine" },
  "steam-engine": { size: [5, 3], rotatable: true, kind: "machine" },
  "steam-turbine": { size: [5, 3], rotatable: true, kind: "machine" },
  "heat-pipe": { size: [1, 1], kind: "pipe" },
  "heat-exchanger": { size: [3, 2], rotatable: true, kind: "machine" },
  // ── Containers ───────────────────────────────────────────────────────────────
  "wooden-chest": { size: [1, 1], kind: "container" },
  "iron-chest": { size: [1, 1], kind: "container" },
  "steel-chest": { size: [1, 1], kind: "container" },
  "passive-provider-chest": { size: [1, 1], kind: "container" },
  "active-provider-chest": { size: [1, 1], kind: "container" },
  "storage-chest": { size: [1, 1], kind: "container" },
  "buffer-chest": { size: [1, 1], kind: "container" },
  "requester-chest": { size: [1, 1], kind: "container" },
  // ── Fluids ───────────────────────────────────────────────────────────────────
  pipe: { size: [1, 1], kind: "pipe" },
  "pipe-to-ground": { size: [1, 1], rotatable: true, kind: "pipe", undergroundReach: 10 },
  "storage-tank": { size: [3, 3], rotatable: true, kind: "machine" },
  pump: { size: [1, 2], rotatable: true, kind: "machine", powered: true },
  "offshore-pump": { size: [1, 2], rotatable: true, kind: "machine" },
  // ── Production support ───────────────────────────────────────────────────────
  beacon: { size: [3, 3], kind: "machine", moduleSlots: 2, moduleInventory: 1, powered: true },
  lab: { size: [3, 3], kind: "machine", moduleInventory: 3 },
  "biolab": { size: [5, 5], kind: "machine", moduleInventory: 3 },
  radar: { size: [3, 3], kind: "machine", powered: true },
  roboport: { size: [4, 4], kind: "machine", powered: true },
  "small-lamp": { size: [1, 1], kind: "misc", powered: true },
  // ── Circuits ─────────────────────────────────────────────────────────────────
  "constant-combinator": { size: [1, 1], rotatable: true, kind: "misc" },
  "arithmetic-combinator": { size: [1, 2], rotatable: true, kind: "misc", powered: true },
  "decider-combinator": { size: [1, 2], rotatable: true, kind: "misc", powered: true },
  "selector-combinator": { size: [1, 2], rotatable: true, kind: "misc", powered: true },
  "power-switch": { size: [2, 2], kind: "misc" },
  "programmable-speaker": { size: [1, 1], kind: "misc", powered: true },
  "display-panel": { size: [1, 1], rotatable: true, kind: "misc", powered: true },
  // ── Defence / walls ──────────────────────────────────────────────────────────
  "stone-wall": { size: [1, 1], kind: "misc" },
  gate: { size: [1, 1], rotatable: true, kind: "misc" },
  "gun-turret": { size: [2, 2], rotatable: true, kind: "misc" },
  "laser-turret": { size: [2, 2], rotatable: true, kind: "misc", powered: true },
  "flamethrower-turret": { size: [3, 2], rotatable: true, kind: "misc" },
  // ── Trains ───────────────────────────────────────────────────────────────────
  "train-stop": { size: [2, 2], rotatable: true, kind: "misc" },
  "rail-signal": { size: [1, 1], rotatable: true, kind: "misc" },
  "rail-chain-signal": { size: [1, 1], rotatable: true, kind: "misc" }
};
var ROTATABLE_MACHINES = /* @__PURE__ */ new Set([
  "chemical-plant",
  "oil-refinery",
  "electromagnetic-plant",
  "foundry",
  "biochamber",
  "cryogenic-plant",
  "assembling-machine-2",
  "assembling-machine-3",
  "burner-mining-drill",
  "electric-mining-drill",
  "big-mining-drill",
  "pumpjack",
  "agricultural-tower",
  "rocket-silo",
  "thruster"
]);
function moduleInventoryFor(name) {
  if (name.includes("mining-drill") || name === "pumpjack") return 2;
  if (name === "beacon") return 1;
  if (name === "lab" || name === "biolab") return 3;
  return 4;
}

// src/core/proto.ts
var TIER_ALIASES = {
  belt: {
    yellow: "transport-belt",
    normal: "transport-belt",
    basic: "transport-belt",
    red: "fast-transport-belt",
    fast: "fast-transport-belt",
    blue: "express-transport-belt",
    express: "express-transport-belt",
    green: "turbo-transport-belt",
    turbo: "turbo-transport-belt"
  },
  underground: {
    yellow: "underground-belt",
    normal: "underground-belt",
    red: "fast-underground-belt",
    fast: "fast-underground-belt",
    blue: "express-underground-belt",
    express: "express-underground-belt",
    green: "turbo-underground-belt",
    turbo: "turbo-underground-belt"
  },
  splitter: {
    yellow: "splitter",
    normal: "splitter",
    red: "fast-splitter",
    fast: "fast-splitter",
    blue: "express-splitter",
    express: "express-splitter",
    green: "turbo-splitter",
    turbo: "turbo-splitter"
  }
};
var ProtoRegistry = class {
  constructor(dataset, profile) {
    this.dataset = dataset;
    this.profile = profile;
    for (const icon of dataset.icons) this.icons.set(icon.id, icon);
    for (const recipe of dataset.recipes) this.recipes.set(recipe.id, recipe);
    this.qualities = (dataset.qualities ?? []).map((q) => q.id);
    for (const item of dataset.items) {
      this.itemLabels.set(item.id, item.name);
      if (item.module) this.modules.add(item.id);
      const overrides = ENTITY_GEOMETRY[item.id];
      const machineSize = item.machine?.size;
      if (!overrides && !machineSize) continue;
      const size = machineSize ?? overrides.size;
      this.entities.set(item.id, {
        name: item.id,
        label: item.name,
        size: vec(size[0], size[1]),
        rotatable: overrides?.rotatable ?? ROTATABLE_MACHINES.has(item.id),
        kind: overrides?.kind ?? (item.machine ? "machine" : "misc"),
        moduleSlots: item.machine?.modules ?? overrides?.moduleSlots ?? 0,
        moduleInventory: overrides?.moduleInventory ?? moduleInventoryFor(item.id),
        undergroundReach: overrides?.undergroundReach,
        icon: this.icons.get(item.id),
        craftingSpeed: item.machine?.speed,
        beltSpeed: item.belt?.speed,
        supplyArea: overrides?.supplyArea,
        needsPower: overrides?.powered ?? item.machine?.type === "electric"
      });
    }
  }
  entities = /* @__PURE__ */ new Map();
  recipes = /* @__PURE__ */ new Map();
  icons = /* @__PURE__ */ new Map();
  qualities;
  modules = /* @__PURE__ */ new Set();
  itemLabels = /* @__PURE__ */ new Map();
  /** Resolves `:fast` / `:red` / `fast-transport-belt` to a prototype of the given family. */
  resolveTier(family, tier) {
    const aliased = TIER_ALIASES[family]?.[tier];
    if (aliased && this.entities.has(aliased)) return aliased;
    return this.entities.has(tier) ? tier : void 0;
  }
  /** Entity names close to `name`, for "did you mean" hints. */
  suggest(name, limit = 3) {
    return closestNames(name, this.entities.keys(), limit);
  }
};

// src/core/routing.ts
function planRoute(path, blocked, reach) {
  const steps = path.map(() => "belt");
  let i = 0;
  while (i < path.length) {
    if (!blocked[i]) {
      i++;
      continue;
    }
    let end = i;
    while (end < path.length && blocked[end]) end++;
    const entry = i - 1;
    const exit = end;
    if (entry < 0) return { ok: false, reason: "starts-blocked", at: path[i] };
    if (exit >= path.length) return { ok: false, reason: "ends-blocked", at: path[i] };
    if (steps[entry] !== "belt") return { ok: false, reason: "no-room", at: path[entry] };
    const covered = exit - entry - 1;
    if (covered > reach) return { ok: false, reason: "too-far", at: path[i], needed: covered };
    const straight = directionBetween(path[entry], path[exit]);
    const heading = directionBetween(path[entry], path[entry + 1]);
    if (straight === void 0 || straight !== heading) {
      return { ok: false, reason: "turns", at: path[i] };
    }
    steps[entry] = "in";
    steps[exit] = "out";
    for (let k = i; k < end; k++) steps[k] = "skip";
    i = exit + 1;
  }
  return { ok: true, steps };
}

// src/core/scene.ts
var Scene = class {
  entities = [];
  diagnostics = [];
  get length() {
    return this.entities.length;
  }
  place(proto, x, y, dir, extra = {}) {
    const size = rotateSize(proto.size, proto.rotatable ? dir : 0);
    const entity = {
      proto,
      x,
      y,
      w: size.x,
      h: size.y,
      dir: proto.rotatable ? dir : 0,
      ...extra
    };
    this.entities.push(entity);
    return entity;
  }
  warn(message, loc) {
    this.diagnostics.push({ severity: "warning", message, loc });
  }
  /** Bounding box over a half-open index range, in tiles. */
  bbox(from = 0, to = this.entities.length) {
    let box = null;
    for (let i = from; i < to; i++) {
      const e = this.entities[i];
      box = unionRect(box, { x: e.x, y: e.y, w: e.w, h: e.h });
    }
    return box;
  }
  translate(from, to, dx, dy) {
    if (dx === 0 && dy === 0) return;
    for (let i = from; i < to; i++) {
      this.entities[i].x += dx;
      this.entities[i].y += dy;
    }
  }
  /** Removes a range and returns it. Used by `measure`, which must not emit. */
  cut(from, to) {
    return this.entities.splice(from, to - from);
  }
  /**
   * Overlap check, run once over the finished scene rather than incrementally — ranges get
   * moved and cut during evaluation, so an incremental occupancy index would need undo.
   */
  findCollisions() {
    const occupied = /* @__PURE__ */ new Map();
    const clashes = [];
    const seen = /* @__PURE__ */ new Set();
    this.entities.forEach((entity, index) => {
      for (let dx = 0; dx < entity.w; dx++) {
        for (let dy = 0; dy < entity.h; dy++) {
          const key3 = `${entity.x + dx},${entity.y + dy}`;
          const other = occupied.get(key3);
          if (other === void 0) {
            occupied.set(key3, index);
            continue;
          }
          const pairKey = `${other}|${index}`;
          if (seen.has(pairKey)) continue;
          seen.add(pairKey);
          clashes.push({ a: this.entities[other], b: entity, x: entity.x + dx, y: entity.y + dy });
        }
      }
    });
    return clashes;
  }
};

// src/core/topology.ts
var CARDINALS = [Direction.north, Direction.east, Direction.south, Direction.west];
var STEP = {
  [Direction.north]: { x: 0, y: -1 },
  [Direction.east]: { x: 1, y: 0 },
  [Direction.south]: { x: 0, y: 1 },
  [Direction.west]: { x: -1, y: 0 }
};
var PIPE_SIDE = {
  [Direction.north]: "up",
  [Direction.east]: "right",
  [Direction.south]: "down",
  [Direction.west]: "left"
};
var key2 = (x, y) => `${x},${y}`;
function isBeltish(entity) {
  const kind = entity.proto.kind;
  return kind === "belt" || kind === "underground-belt" || kind === "splitter";
}
function isPipeish(entity) {
  return entity.proto.kind === "pipe";
}
function tileIndex(entities, accept) {
  const index = /* @__PURE__ */ new Map();
  for (const entity of entities) {
    if (!accept(entity)) continue;
    for (let dx = 0; dx < entity.w; dx++) {
      for (let dy = 0; dy < entity.h; dy++) index.set(key2(entity.x + dx, entity.y + dy), entity);
    }
  }
  return index;
}
function entrySides(entity, belts) {
  const sides = [];
  for (const side of CARDINALS) {
    const step = STEP[side];
    const neighbour = belts.get(key2(entity.x + step.x, entity.y + step.y));
    if (!neighbour || neighbour === entity) continue;
    if (neighbour.proto.kind === "underground-belt" && neighbour.undergroundType !== "output") continue;
    const out = STEP[neighbour.dir];
    if (out && neighbour.x + out.x === entity.x && neighbour.y + out.y === entity.y) sides.push(side);
  }
  return sides;
}
function beltOrientation(entity, belts) {
  const facing = directionName(entity.dir);
  const sides = entrySides(entity, belts);
  const behind = oppositeDirection(entity.dir);
  if (sides.includes(behind)) return facing;
  if (sides.length !== 1) return facing;
  const side = sides[0];
  if (side === entity.dir) return facing;
  return `${directionName(side)}-to-${facing}`;
}
function spriteVariants(entity, belts, pipes) {
  const facing = directionName(entity.dir);
  const candidates = [];
  switch (entity.proto.kind) {
    case "belt":
      candidates.push(beltOrientation(entity, belts));
      break;
    case "underground-belt":
      candidates.push(`${entity.undergroundType === "output" ? "out" : "in"}-${facing}`);
      break;
    case "pipe":
      candidates.push(pipeShape(entity, pipes));
      break;
    default:
      break;
  }
  candidates.push(facing, "default", "north");
  return candidates;
}
function pipeShape(entity, pipes) {
  const connected = [];
  for (const side of CARDINALS) {
    const step = STEP[side];
    const neighbour = pipes.get(key2(entity.x + step.x, entity.y + step.y));
    if (!neighbour || neighbour === entity) continue;
    if (neighbour.proto.name.endsWith("-to-ground") && neighbour.dir !== oppositeDirection(side)) continue;
    connected.push(PIPE_SIDE[side]);
  }
  const has = (s) => connected.includes(s);
  if (connected.length === 0) return "straight-vertical-single";
  if (connected.length === 1) return `ending-${connected[0]}`;
  if (connected.length === 4) return "cross";
  if (connected.length === 3) {
    const missing = ["up", "right", "down", "left"].find((s) => !has(s));
    const opposite = { up: "down", down: "up", left: "right", right: "left" };
    return `t-${opposite[missing]}`;
  }
  if (has("up") && has("down")) return "straight-vertical";
  if (has("left") && has("right")) return "straight-horizontal";
  return `corner-${has("up") ? "up" : "down"}-${has("right") ? "right" : "left"}`;
}

// src/core/values.ts
var EnumValue = class {
  constructor(enumName, member) {
    this.enumName = enumName;
    this.member = member;
  }
  toString() {
    return this.member;
  }
};
function isHandle(value) {
  return typeof value === "object" && value !== null && value.handle === true;
}
function makeHandle(fields) {
  return { handle: true, ...fields };
}
function show(value) {
  if (value === null) return "nothing";
  if (Array.isArray(value)) return `(${value.map(show).join(", ")})`;
  if (value instanceof EnumValue) return value.member;
  if (isHandle(value)) return `<${String(value.name ?? "block")} ${String(value.width)}\xD7${String(value.height)}>`;
  return String(value);
}

// src/core/run.ts
var Scope2 = class _Scope {
  constructor(parent) {
    this.parent = parent;
  }
  names = /* @__PURE__ */ new Map();
  get(name) {
    if (this.names.has(name)) return { value: this.names.get(name) };
    return this.parent?.get(name);
  }
  set(name, value) {
    this.names.set(name, value);
  }
  child() {
    return new _Scope(this);
  }
};
var Runtime = class {
  constructor(registry) {
    this.registry = registry;
  }
  scene = new Scene();
  offset = vec(0, 0);
  output = [];
  blocks = /* @__PURE__ */ new Map();
  /** Innermost last. Each `defaults` statement pushes a frame for its scope. */
  defaults = [[]];
  /**
   * While a layout combinator evaluates a child, `for` hands it the scene range of each pass,
   * so `row => { for i in 0..8 => { cell () } }` lays out eight items, not one clump. The
   * layout settles each pass as it arrives, which is what keeps `auto` seeing real neighbours.
   */
  iterationSink = null;
  run(module) {
    this.scene = new Scene();
    this.offset = vec(0, 0);
    this.output.length = 0;
    this.blocks.clear();
    for (const statement of module.statements) {
      if (statement.kind === "defblock") {
        this.blocks.set(statement.name, { name: statement.name, params: statement.params, body: statement.body });
      }
    }
    const scope = new Scope2();
    this.runStatements(module.statements, scope);
    return { scene: this.scene, output: [...this.output] };
  }
  // ── Statements ──────────────────────────────────────────────────────────────
  runStatements(statements, scope) {
    for (const statement of statements) this.runStatement(statement, scope);
  }
  runStatement(statement, scope) {
    switch (statement.kind) {
      case "defblock":
        this.blocks.set(statement.name, { name: statement.name, params: statement.params, body: statement.body });
        return;
      case "def":
      case "assign":
        scope.set(statement.name, this.evaluate(statement.value, scope));
        return;
      case "defaults": {
        const entries = [];
        for (const arg of statement.args) {
          const form = argForm(arg, []);
          if (!form.slotName) continue;
          entries.push({ target: statement.target, slot: form.slotName, value: this.evaluate(form.expr, scope) });
        }
        if (statement.body) {
          this.defaults.push(entries);
          try {
            this.runStatements(statement.body, scope.child());
          } finally {
            this.defaults.pop();
          }
        } else {
          this.defaults[this.defaults.length - 1].push(...entries);
        }
        return;
      }
      case "for": {
        const sink = this.iterationSink;
        this.iterationSink = null;
        const items = this.iterable(this.evaluate(statement.iterable, scope), statement.iterable.loc);
        try {
          for (const item of items) {
            const inner = scope.child();
            inner.set(statement.name, item);
            const from = this.scene.length;
            this.runStatements(statement.body, inner);
            sink?.(from, this.scene.length);
          }
        } finally {
          this.iterationSink = sink;
        }
        return;
      }
      case "if": {
        const condition = this.evaluate(statement.condition, scope);
        if (condition !== false && condition !== null) this.runStatements(statement.then, scope.child());
        else if (statement.else) this.runStatements(statement.else, scope.child());
        return;
      }
      case "block":
        this.runLayout(statement, scope);
        return;
      case "expr":
        this.evaluate(statement.expr, scope);
    }
  }
  iterable(value, loc) {
    if (Array.isArray(value)) return value;
    fail(`cannot iterate ${show(value)}`, loc);
  }
  // ── Layout ──────────────────────────────────────────────────────────────────
  runLayout(statement, scope) {
    const slots = LAYOUT_SLOTS[statement.form];
    const filled = this.fillSlots(statement.args, slots, statement.form, scope, false);
    if (statement.form === "at") {
      const delta = this.toVec(filled.get("at") ?? [0, 0], "at", statement.loc);
      return this.inFrame(addVec(this.offset, delta), () => this.runStatements(statement.body, scope.child()));
    }
    const axis = statement.form === "row" ? "x" : "y";
    const cross = axis === "x" ? "y" : "x";
    const mainSize = axis === "x" ? "w" : "h";
    const crossSize = axis === "x" ? "h" : "w";
    const gap = typeof filled.get("gap") === "number" ? filled.get("gap") : 0;
    const alignValue = filled.get("align");
    const align = alignValue instanceof EnumValue ? alignValue.member : "start";
    const origin = this.offset;
    const start = this.scene.length;
    const ranges = [];
    let cursor = 0;
    const settle = (from, to) => {
      if (to === from) return;
      const box = this.scene.bbox(from, to);
      const dMain = origin[axis] + cursor - box[axis];
      this.scene.translate(from, to, axis === "x" ? dMain : 0, axis === "y" ? dMain : 0);
      const dCross = origin[cross] - box[cross];
      this.scene.translate(from, to, cross === "x" ? dCross : 0, cross === "y" ? dCross : 0);
      ranges.push({ from, to, crossExtent: box[crossSize] });
      cursor += box[mainSize] + gap;
      this.offset = axis === "x" ? vec(origin.x + cursor, origin.y) : vec(origin.x, origin.y + cursor);
    };
    try {
      if (statement.each) {
        const each = statement.each;
        for (const value of this.iterable(this.evaluate(each.iterable, scope), each.iterable.loc)) {
          const inner = scope.child();
          inner.set(each.name, value);
          const from = this.scene.length;
          this.runStatements(statement.body, inner);
          settle(from, this.scene.length);
        }
      } else {
        for (const child of statement.body) {
          let reported = false;
          this.iterationSink = (from2, to) => {
            reported = true;
            settle(from2, to);
          };
          const from = this.scene.length;
          try {
            this.runStatement(child, scope);
          } finally {
            this.iterationSink = null;
          }
          if (!reported) settle(from, this.scene.length);
        }
      }
    } finally {
      this.offset = origin;
    }
    if (align === "center" || align === "end") {
      const widest = Math.max(0, ...ranges.map((r) => r.crossExtent));
      for (const range of ranges) {
        const slack = widest - range.crossExtent;
        const shift = align === "center" ? Math.floor(slack / 2) : slack;
        if (shift) this.scene.translate(range.from, range.to, cross === "x" ? shift : 0, cross === "y" ? shift : 0);
      }
    }
    return rectHandle(this.scene.bbox(start, this.scene.length));
  }
  inFrame(origin, body, name) {
    const previous = this.offset;
    const start = this.scene.length;
    this.offset = origin;
    try {
      body();
    } finally {
      this.offset = previous;
    }
    return rectHandle(this.scene.bbox(start, this.scene.length), name ? { name } : {});
  }
  // ── Expressions ─────────────────────────────────────────────────────────────
  evaluate(expr, scope) {
    switch (expr.kind) {
      case "number":
        return expr.value;
      case "text":
        return expr.value;
      case "tuple":
        return expr.items.map((item) => this.evaluate(item, scope));
      case "name": {
        const bound = scope.get(expr.name);
        if (bound) return bound.value;
        return new EnumValue(this.enumOf(expr.name), expr.name);
      }
      case "range": {
        const from = Number(this.evaluate(expr.from, scope));
        const to = Number(this.evaluate(expr.to, scope));
        const out = [];
        for (let i = from; i < to; i++) out.push(i);
        return out;
      }
      case "unary": {
        const operand = this.evaluate(expr.operand, scope);
        if (expr.op === "not") return operand === false || operand === null;
        return -Number(operand);
      }
      case "binary":
        return this.evaluateBinary(expr, scope);
      case "field":
        return this.evaluateField(expr, scope);
      case "measure": {
        const start = this.scene.length;
        this.evaluate(expr.body, scope);
        const end = this.scene.length;
        const box = this.scene.bbox(start, end);
        this.scene.cut(start, end);
        return rectHandle(box);
      }
      case "call":
        return this.evaluateCall(expr, scope);
    }
  }
  /**
   * A bare name that is not a variable is a member of one of the vocabularies. The order
   * mirrors Universe.bareEnum in the checker, so both agree on what `blue` means.
   */
  enumOf(name) {
    if (directionFromName(name) !== void 0) return "direction";
    if (TIERS.includes(name)) return "tier";
    if (this.registry.qualities.includes(name)) return "quality";
    if (UNDERGROUND_TYPES.includes(name)) return "underground-type";
    if (ALIGNMENTS.includes(name)) return "align";
    if (ROUTINGS.includes(name)) return "routing";
    if (this.registry.modules.has(name)) return "item";
    if (this.registry.recipes.has(name)) return "recipe";
    return "item";
  }
  evaluateBinary(expr, scope) {
    if (expr.op === "and") {
      const left2 = this.evaluate(expr.left, scope);
      return left2 === false || left2 === null ? left2 : this.evaluate(expr.right, scope);
    }
    if (expr.op === "or") {
      const left2 = this.evaluate(expr.left, scope);
      return left2 === false || left2 === null ? this.evaluate(expr.right, scope) : left2;
    }
    const left = this.evaluate(expr.left, scope);
    const right = this.evaluate(expr.right, scope);
    switch (expr.op) {
      case "==":
        return sameValue(left, right);
      case "!=":
        return !sameValue(left, right);
      case "<":
        return Number(left) < Number(right);
      case "<=":
        return Number(left) <= Number(right);
      case ">":
        return Number(left) > Number(right);
      case ">=":
        return Number(left) >= Number(right);
      case "+":
        return Number(left) + Number(right);
      case "-":
        return Number(left) - Number(right);
      case "*":
        return Number(left) * Number(right);
      case "%":
        return Number(left) % Number(right);
      case "/": {
        if (Number(right) === 0) fail("division by zero", expr.loc);
        return Number(left) / Number(right);
      }
      default:
        return fail(`unknown operator '${expr.op}'`, expr.loc);
    }
  }
  evaluateField(expr, scope) {
    const target = this.evaluate(expr.target, scope);
    if (Array.isArray(target)) {
      if (expr.field === "x") return target[0] ?? 0;
      if (expr.field === "y") return target[1] ?? 0;
      fail(`a coordinate has only .x and .y`, expr.loc);
    }
    if (isHandle(target)) {
      const value = target[expr.field];
      if (value === void 0) fail(`no field '.${expr.field}'`, expr.loc);
      return value;
    }
    return fail(`${show(target)} has no fields`, expr.loc);
  }
  // ── Calls ───────────────────────────────────────────────────────────────────
  evaluateCall(expr, scope) {
    const bound = scope.get(expr.callee);
    if (bound) {
      const name = memberOf(bound.value);
      if (!name) fail(`'${expr.callee}' is not something you can place`, expr.loc);
      const block2 = this.blocks.get(name);
      if (block2) return this.placeBlock(block2, expr.args, scope, expr.loc);
      const proto2 = this.registry.entities.get(name);
      if (proto2) return this.placeEntity(proto2, expr.args, scope, expr.loc);
      fail(`'${name}' is not an entity or a block`, expr.loc);
    }
    const builtin = BUILTINS[expr.callee];
    if (builtin) {
      return builtin(
        expr.args.map((arg) => this.evaluate(arg.value, scope)),
        this,
        expr.loc
      );
    }
    const block = this.blocks.get(expr.callee);
    if (block) return this.placeBlock(block, expr.args, scope, expr.loc);
    const proto = this.registry.entities.get(expr.callee);
    if (proto) return this.placeEntity(proto, expr.args, scope, expr.loc);
    if (expr.callee === "belt") return this.placeBelt(expr.args, scope, expr.loc);
    if (expr.callee === "underground") return this.placeUnderground(expr.args, scope, expr.loc);
    if (expr.callee === "balancer") return this.placeBalancer(expr.args, scope, expr.loc);
    return fail(`unknown name '${expr.callee}'`, expr.loc);
  }
  /** Turns argument nodes into slot values, then fills the gaps from the `defaults` chain. */
  fillSlots(args, slots, calleeName, scope, applyDefaults = true, target, unknownSlot = "fail") {
    const filled = /* @__PURE__ */ new Map();
    for (const arg of args) {
      const form = argForm(arg, slots);
      let slot;
      if (form.slotName) {
        slot = findSlot(slots, form.slotName);
        if (!slot) {
          if (unknownSlot === "fail") fail(`'${calleeName}' has no slot '${form.slotName}'`, form.labelLoc);
          const value = this.evaluate(form.expr, scope);
          if (!(Array.isArray(value) && value.length === 0)) {
            this.scene.warn(`${calleeName} has no '${form.slotName}' slot \u2014 ignored`, form.labelLoc ?? form.loc);
          }
          continue;
        }
      } else {
        const value = this.evaluate(form.expr, scope);
        const type = typeOfValue(value);
        slot = type ? bareSlot(slots, type) : void 0;
        if (!slot) fail(`this value needs a label`, form.loc);
        filled.set(slot.name, value);
        continue;
      }
      filled.set(slot.name, this.evaluate(form.expr, scope));
    }
    if (applyDefaults && target) {
      for (const slot of slots) {
        if (filled.has(slot.name)) continue;
        const fallback = this.lookupDefault(slot.name, target);
        if (fallback !== void 0) filled.set(slot.name, fallback);
      }
    }
    return filled;
  }
  /** Innermost scope wins; inside a scope, an entity name beats a family beats a bare slot. */
  lookupDefault(slot, target) {
    for (let i = this.defaults.length - 1; i >= 0; i--) {
      const frame = this.defaults[i];
      for (const preference of [target.name, target.kind, void 0]) {
        const entry = frame.findLast((e) => e.slot === slot && e.target === preference);
        if (entry) return entry.value;
      }
    }
    return void 0;
  }
  // ── Placement ───────────────────────────────────────────────────────────────
  placeBlock(block, args, scope, loc) {
    const slots = blockSlots(
      block.params.map((p) => ({
        name: p.name,
        typeName: p.type.name,
        array: p.type.array,
        required: p.default === void 0
      })),
      () => T.any
    );
    const filled = this.fillSlots(args, slots, block.name, scope, false);
    const inner = new Scope2();
    for (const param of block.params) {
      if (filled.has(param.name)) inner.set(param.name, filled.get(param.name));
      else if (param.default) inner.set(param.name, this.evaluate(param.default, inner));
      else fail(`'${block.name}' needs ${param.name}`, loc);
    }
    const at = filled.has("at") ? this.toVec(filled.get("at"), "at", loc) : vec(0, 0);
    return this.inFrame(addVec(this.offset, at), () => this.runStatements(block.body, inner), block.name);
  }
  placeEntity(proto, args, scope, loc) {
    const slots = entitySlots(proto, this.registry.profile.supportsQuality);
    const filled = this.fillSlots(
      args,
      slots,
      proto.label,
      scope,
      true,
      { name: proto.name, kind: proto.kind },
      "skip"
    );
    const at = filled.has("at") ? this.toVec(filled.get("at"), "at", loc) : vec(0, 0);
    const position = addVec(this.offset, at);
    let dir = this.toDirection(filled.get("dir"), loc);
    if (filled.has("from") && proto.kind === "inserter") {
      dir = oppositeDirection(this.toDirection(filled.get("from"), loc));
    }
    const modules = this.toModules(filled.get("modules"), loc);
    if (modules && modules.length > proto.moduleSlots) {
      this.scene.warn(`${proto.label} has ${proto.moduleSlots} module slot(s) but ${modules.length} were given`, loc);
    }
    const recipe = memberOf(filled.get("recipe"));
    if (recipe) {
      const known = this.registry.recipes.get(recipe);
      if (!known) this.scene.warn(`unknown recipe '${recipe}'`, loc);
      else if (known.producers && !known.producers.includes(proto.name)) {
        this.scene.warn(`${proto.label} cannot craft ${recipe}`, loc);
      }
    }
    const entity = this.scene.place(proto, position.x, position.y, dir, {
      recipe,
      modules,
      quality: memberOf(filled.get("quality")),
      undergroundType: proto.kind === "underground-belt" ? memberOf(filled.get("type")) ?? "input" : void 0,
      loc
    });
    return rectHandle({ x: entity.x, y: entity.y, w: entity.w, h: entity.h }, {
      name: proto.name,
      dir: new EnumValue("direction", directionName(entity.dir))
    });
  }
  beltProto(family, filled, loc) {
    const tier = memberOf(filled.get("tier")) ?? "normal";
    const name = this.registry.resolveTier(family, tier);
    if (!name) fail(`no ${family} tier '${tier}'`, loc, "try yellow, red, blue or green");
    return this.registry.entities.get(name);
  }
  placeBelt(args, scope, loc) {
    const filled = this.fillSlots(args, HELPER_SLOTS.belt, "belt", scope, true, { name: "belt", kind: "belt" });
    const proto = this.beltProto("belt", filled, loc);
    const start = filled.has("from") ? addVec(this.offset, this.toVec(filled.get("from"), "from", loc)) : this.offset;
    const points = [start];
    for (const point of toCoordList(filled.get("via"))) {
      points.push(addVec(this.offset, this.toVec(point, "via", loc)));
    }
    const fallbackDir = this.toDirection(filled.get("dir"), loc);
    if (filled.has("to")) {
      points.push(addVec(this.offset, this.toVec(filled.get("to"), "to", loc)));
    } else if (filled.has("length")) {
      const length = Number(filled.get("length"));
      const step = directionStep(fallbackDir);
      const last = points[points.length - 1];
      points.push(vec(last.x + step.x * (length - 1), last.y + step.y * (length - 1)));
    }
    const corners = points.filter((p, i) => i === 0 || p.x !== points[i - 1].x || p.y !== points[i - 1].y);
    const path = expandPath(corners, loc);
    const from = this.scene.length;
    const routing = memberOf(filled.get("route")) ?? "direct";
    const steps = routing === "auto" ? this.routeUnder(path, filled, loc) : path.map(() => "belt");
    const undergroundProto = routing === "auto" ? this.beltProto("underground", filled, loc) : void 0;
    for (let i = 0; i < path.length; i++) {
      if (steps[i] === "skip") continue;
      const next = path[i + 1];
      const previous = path[i - 1];
      const dir = next ? directionBetween(path[i], next) : previous ? directionBetween(previous, path[i]) : fallbackDir;
      if (steps[i] === "belt") {
        this.scene.place(proto, path[i].x, path[i].y, dir, { loc });
      } else {
        this.scene.place(undergroundProto, path[i].x, path[i].y, dir, {
          undergroundType: steps[i] === "in" ? "input" : "output",
          loc
        });
      }
    }
    return rectHandle(this.scene.bbox(from, this.scene.length), {
      name: proto.name,
      tiles: path.length,
      from: [path[0].x, path[0].y],
      to: [path[path.length - 1].x, path[path.length - 1].y]
    });
  }
  /** `auto`: tunnel under whatever is already standing on the path. */
  routeUnder(path, filled, loc) {
    const underground = this.beltProto("underground", filled, loc);
    const reach = underground.undergroundReach ?? 0;
    const occupied = tileIndex(this.scene.entities, () => true);
    const blocked = path.map((p) => occupied.has(`${p.x},${p.y}`));
    const plan = planRoute(path, blocked, reach);
    if (plan.ok) return plan.steps;
    const where = `(${plan.at.x}, ${plan.at.y})`;
    switch (plan.reason) {
      case "starts-blocked":
        fail(`the belt starts on something at ${where}`, loc, "a tunnel needs a free tile to dive from");
      case "ends-blocked":
        fail(`the belt ends on something at ${where}`, loc, "a tunnel needs a free tile to surface on");
      case "no-room":
        fail(
          `two obstacles too close together at ${where}`,
          loc,
          "one tile cannot be both the exit of a tunnel and the entry of the next"
        );
      case "turns":
        fail(`the belt turns at ${where}, where it has to tunnel`, loc, "move the corner clear of the obstacle");
      case "too-far":
        fail(
          `${plan.needed} tiles to tunnel at ${where}, but ${underground.label} reaches ${reach}`,
          loc,
          this.longerTier(reach)
        );
    }
  }
  /** Names a tier that would actually clear the gap, if there is one. */
  longerTier(reach) {
    const better = ["yellow", "red", "blue", "green"].map((tier) => ({ tier, proto: this.registry.entities.get(this.registry.resolveTier("underground", tier) ?? "") })).filter((c) => c.proto && (c.proto.undergroundReach ?? 0) > reach);
    return better.length ? `${better[0].tier} reaches ${better[0].proto.undergroundReach}` : void 0;
  }
  placeUnderground(args, scope, loc) {
    const filled = this.fillSlots(args, HELPER_SLOTS.underground, "underground", scope, true, {
      name: "underground",
      kind: "underground-belt"
    });
    const proto = this.beltProto("underground", filled, loc);
    const start = filled.has("from") ? addVec(this.offset, this.toVec(filled.get("from"), "from", loc)) : this.offset;
    if (!filled.has("to")) fail("underground needs to", loc, "underground (from (0, 0) to (5, 0))");
    const end = addVec(this.offset, this.toVec(filled.get("to"), "to", loc));
    const dir = directionBetween(start, end);
    if (dir === void 0) fail("an underground entry and exit must share a row or column", loc);
    const span2 = Math.abs(end.x - start.x) + Math.abs(end.y - start.y);
    if (proto.undergroundReach !== void 0 && span2 - 1 > proto.undergroundReach) {
      this.scene.warn(`${proto.label} spans ${span2 - 1} tiles but reaches ${proto.undergroundReach}`, loc);
    }
    const from = this.scene.length;
    this.scene.place(proto, start.x, start.y, dir, { undergroundType: "input", loc });
    this.scene.place(proto, end.x, end.y, dir, { undergroundType: "output", loc });
    return rectHandle(this.scene.bbox(from, this.scene.length), { name: proto.name });
  }
  /** Expands a library balancer into belts, undergrounds and splitters of the chosen tier. */
  placeBalancer(args, scope, loc) {
    const filled = this.fillSlots(args, HELPER_SLOTS.balancer, "balancer", scope, true, {
      name: "balancer",
      kind: "belt"
    });
    const from = Number(filled.get("in"));
    const to = Number(filled.get("to"));
    const dir = this.toDirection(filled.get("dir"), loc);
    if (dir % 4 !== 0) fail("a balancer runs along an axis", loc, "use north, east, south or west");
    const layout = balancerLayout(from, to, dir);
    if (!layout) {
      fail(
        `there is no ${from} to ${to} balancer in the library`,
        loc,
        `inputs and outputs both run from 1 to ${BALANCER_LIMIT}`
      );
    }
    const tier = memberOf(filled.get("tier")) ?? "normal";
    const protoFor = (family) => {
      const name = this.registry.resolveTier(family, tier);
      if (!name) fail(`no ${family} tier '${tier}'`, loc, "try yellow, red, blue or green");
      return this.registry.entities.get(name);
    };
    const protos = {
      [BELT]: protoFor("belt"),
      [UNDERGROUND]: protoFor("underground"),
      [SPLITTER]: protoFor("splitter")
    };
    const at = filled.has("at") ? this.toVec(filled.get("at"), "at", loc) : vec(0, 0);
    const origin = addVec(this.offset, at);
    const start = this.scene.length;
    for (const part of layout.parts) {
      this.scene.place(protos[part.kind], origin.x + part.x, origin.y + part.y, part.dir, {
        undergroundType: part.kind === UNDERGROUND ? part.underground === 1 ? "output" : "input" : void 0,
        loc
      });
    }
    return rectHandle(this.scene.bbox(start, this.scene.length), {
      name: `balancer ${from}-${to}`,
      lanes: from,
      outputs: to
    });
  }
  // ── Coercions ───────────────────────────────────────────────────────────────
  toVec(value, what, loc) {
    if (Array.isArray(value) && value.length === 2 && typeof value[0] === "number" && typeof value[1] === "number") {
      return vec(value[0], value[1]);
    }
    return fail(`${what} needs a coordinate like (2, 3), got ${show(value)}`, loc);
  }
  toDirection(value, loc) {
    if (value === void 0 || value === null) return Direction.north;
    if (typeof value === "number") return (value % 16 + 16) % 16;
    const member = memberOf(value);
    const dir = member === void 0 ? void 0 : directionFromName(member);
    if (dir === void 0) fail(`'${show(value)}' is not a direction`, loc);
    return dir;
  }
  toModules(value, loc) {
    if (value === void 0 || value === null) return void 0;
    const items = Array.isArray(value) ? value : [value];
    const modules = items.map((item) => {
      if (Array.isArray(item)) {
        const [name, quality] = item;
        return { name: memberOf(name) ?? String(name), quality: quality === void 0 ? void 0 : memberOf(quality) };
      }
      return { name: memberOf(item) ?? String(item) };
    });
    void loc;
    return modules.length ? modules : void 0;
  }
};
function toCoordList(value) {
  if (!Array.isArray(value) || value.length === 0) return [];
  return typeof value[0] === "number" ? [value] : value;
}
function typeOfValue(value) {
  if (typeof value === "number") return Number.isInteger(value) ? T.int : T.float;
  if (value instanceof EnumValue) return T.enum(value.enumName);
  if (Array.isArray(value) && value.length === 2 && value.every((v) => typeof v === "number")) return T.coord;
  return void 0;
}
function memberOf(value) {
  if (value instanceof EnumValue) return value.member;
  if (typeof value === "string") return value;
  return void 0;
}
function sameValue(a, b) {
  if (a instanceof EnumValue && b instanceof EnumValue) return a.member === b.member;
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((x, i) => sameValue(x, b[i]));
  return a === b;
}
function expandPath(points, loc) {
  if (points.length <= 1) return points;
  const path = [points[0]];
  for (let i = 0; i + 1 < points.length; i++) {
    const a = points[i];
    const b = points[i + 1];
    const dir = directionBetween(a, b);
    if (dir === void 0) {
      fail(
        `a belt leg from (${a.x}, ${a.y}) to (${b.x}, ${b.y}) is diagonal`,
        loc,
        "belts run horizontally or vertically; add a via corner"
      );
    }
    const step = directionStep(dir);
    let cursor = a;
    while (cursor.x !== b.x || cursor.y !== b.y) {
      cursor = vec(cursor.x + step.x, cursor.y + step.y);
      path.push(cursor);
    }
  }
  return path;
}
function rectHandle(rect, extra = {}) {
  const box = rect ?? { x: 0, y: 0, w: 0, h: 0 };
  return makeHandle({
    x: box.x,
    y: box.y,
    left: box.x,
    top: box.y,
    right: box.x + box.w,
    bottom: box.y + box.h,
    width: box.w,
    height: box.h,
    size: [box.w, box.h],
    pos: [box.x, box.y],
    center: [box.x + box.w / 2, box.y + box.h / 2],
    ...extra
  });
}
var BUILTINS = {
  repeat: (args) => Array.from({ length: Number(args[0]) }, () => args[1]),
  count: (args) => Array.isArray(args[0]) ? args[0].length : 0,
  min: (args) => Math.min(...args.map(Number)),
  max: (args) => Math.max(...args.map(Number)),
  abs: (args) => Math.abs(Number(args[0])),
  floor: (args) => Math.floor(Number(args[0])),
  ceil: (args) => Math.ceil(Number(args[0])),
  round: (args) => Math.round(Number(args[0])),
  print: (args, runtime) => {
    runtime.output.push(args.map(show).join(" "));
    return null;
  },
  ingredients: (args, runtime, loc) => {
    const id = memberOf(args[0]);
    const recipe = id ? runtime.registry.recipes.get(id) : void 0;
    if (!recipe) fail(`unknown recipe '${show(args[0])}'`, loc);
    return Object.keys(recipe.in ?? {}).map((name) => new EnumValue("item", name));
  },
  "craft-time": (args, runtime) => {
    const id = memberOf(args[0]);
    return (id ? runtime.registry.recipes.get(id)?.time : void 0) ?? 0;
  },
  "module-slots": (args, runtime) => {
    const id = memberOf(args[0]);
    return (id ? runtime.registry.entities.get(id)?.moduleSlots : void 0) ?? 0;
  }
};

// src/core/index.ts
function compile(source, registry) {
  const diagnostics = [];
  const empty = new Scene();
  let module;
  try {
    module = parse(source);
  } catch (error) {
    if (error instanceof LangError) {
      return {
        scene: empty,
        output: [],
        diagnostics: [{ severity: "error", message: error.message, loc: error.loc, hint: error.hint }],
        ran: false,
        blocks: []
      };
    }
    throw error;
  }
  const checker = new Checker(registry);
  diagnostics.push(...checker.check(module));
  const blocks = [...checker.blocks.values()];
  if (diagnostics.some((d) => d.severity === "error")) {
    return { scene: empty, output: [], diagnostics, ran: false, blocks };
  }
  try {
    const { scene, output } = new Runtime(registry).run(module);
    diagnostics.push(...scene.diagnostics);
    return { scene, output, diagnostics, ran: true, blocks };
  } catch (error) {
    if (error instanceof LangError) {
      diagnostics.push({ severity: "error", message: error.message, loc: error.loc, hint: error.hint });
      return { scene: empty, output: [], diagnostics, ran: false, blocks };
    }
    throw error;
  }
}
export {
  BALANCER_LIMIT,
  Checker,
  Direction,
  EnumValue,
  FUNCTIONS,
  HELPER_SLOTS,
  LAYOUT_SLOTS,
  LangError,
  ProtoRegistry,
  Runtime,
  Scene,
  Universe,
  balancerLayout,
  balancerSizes,
  beltOrientation,
  check,
  compile,
  computeCost,
  decodeBlueprint,
  directionName,
  encodeBlueprint,
  entitySlots,
  exportBlueprint,
  findSlot,
  hasBalancer,
  isBeltish,
  isPipeish,
  parse,
  pipeShape,
  powerCoverage,
  show,
  showType,
  spriteVariants,
  tileIndex,
  toBlueprintJSON,
  typeNames
};
/*! Bundled license information:

pako/dist/pako.esm.mjs:
  (*! pako 2.2.0 https://github.com/nodeca/pako @license (MIT AND Zlib) *)
*/
