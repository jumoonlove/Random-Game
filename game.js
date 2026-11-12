/* ============================================================
 * game.js  —  회식 자리 뽑기
 * ------------------------------------------------------------
 * 구성
 *   1. 설정 / 색상표
 *   2. 자리 배정 로직 (RULES + assignSeats)  ← 규칙은 여기에 추가
 *   3. 픽셀 캐릭터 그리기
 *   4. 테이블 배치(좌석 좌표 · 걷는 경로 · 이름표 위치)
 *   5. 배경 / 테이블 / 소품 그리기
 *   6. 게임 상태 · 애니메이션 · 화면 출력
 *   7. 버튼 · 참석자 목록 · PNG 저장
 *
 * 그림은 320x240 "아트 픽셀" 캔버스에 그린 뒤 확대해서 보여줍니다.
 * 이미지 파일은 사용하지 않습니다.
 * ============================================================ */
(function () {
  'use strict';

  /* ==========================================================
   * 1. 설정 / 색상표
   * ========================================================== */
  var ART_W = 320, ART_H = 240;   // 픽셀아트 해상도
  var PX = 3;                      // 아트 픽셀 1칸 = 화면 3px
  var SS = 2;                      // 선명도(및 저장 PNG 해상도) 배율
  var VIEW_W = ART_W * PX, VIEW_H = ART_H * PX;   // 960 x 720

  var WALK_SPEED = 80;             // 걷는 속도 (아트 픽셀/초)
  var SPAWN_INTERVAL = 3;          // 다음 사람이 입장하기까지 간격(초)

  var FONT = '"Malgun Gothic","맑은 고딕","Apple SD Gothic Neo","Noto Sans KR",sans-serif';

  var SKIN_TONES = { white: '#fff0e6', light: '#ffe0c4', fair: '#f6cfa6', tan: '#dfa878', dark: '#a87550' };
  var HAIR_COLORS = {
    black: '#2b2326', darkbrown: '#4a3226', brown: '#7a4e2d', lightbrown: '#a8733f',
    gray: '#9a9aa6', blonde: '#e0b85a', red: '#b5452f'
  };

  var DOOR = { x: 160, y: 252 };   // 입구 바깥 시작 위치

  /* ==========================================================
   * 2. 자리 배정 로직
   * ----------------------------------------------------------
   * 규칙(rule) 객체 형식
   *   {
   *     name: '규칙 이름',
   *     // (선택) 고정석: 섞기 전에 먼저 앉힐 사람들을 돌려줍니다.
   *     fixed: function (ctx) { return [{ person: 사람, seatId: 좌석번호 }]; },
   *     // (선택) 검증: 완성된 배정이 규칙에 맞으면 true.
   *     //        false 면 자동으로 다시 섞습니다.
   *     validate: function (assignment, ctx) { return true; }
   *   }
   *   ctx        = { people: 전체 참석자, seats: 전체 좌석 }
   *   assignment = [{ person, seat }, ...]
   *   seat       = { id, x, y, isManagerSeat, adjacent: [옆자리 좌석 id],
   *                  tables: [속한 테이블 번호], near: [가까운 좌석 id] }
   *
   * 아래 RULES 배열에 규칙을 추가하기만 하면 적용됩니다.
   * ========================================================== */

  // 기본 규칙: 지점장님은 항상 지점장석
  var managerFixedRule = {
    name: '지점장 고정석',
    fixed: function (ctx) {
      var manager = ctx.people.filter(function (p) { return p.isManager; })[0];
      var seat = ctx.seats.filter(function (s) { return s.isManagerSeat; })[0];
      return manager && seat ? [{ person: manager, seatId: seat.id }] : [];
    }
  };

  /* ---- 나중에 쓸 규칙 예시 (RULES 에 넣으면 동작합니다) ----

  // 예시 1) 같은 팀끼리 옆자리에 앉지 않기 (characters.js 의 team 사용)
  var separateTeamsRule = {
    name: '같은 팀 떨어뜨리기',
    validate: function (assignment) {
      var bySeat = {};
      assignment.forEach(function (a) { bySeat[a.seat.id] = a.person; });
      return assignment.every(function (a) {
        return a.seat.adjacent.every(function (id) {
          var other = bySeat[id];
          return !other || !a.person.team || other.team !== a.person.team;
        });
      });
    }
  };

  // 예시 2) 특정 인원 고정석 (좌석 번호는 buildRoundLayout / buildRectLayout 참고)
  var fixedSeatRule = {
    name: '특정 인원 고정석',
    fixed: function (ctx) {
      var who = ctx.people.filter(function (p) { return p.name === '직원1'; })[0];
      return who ? [{ person: who, seatId: 1 }] : [];
    }
  };
  ---------------------------------------------------------- */

  // 적용할 규칙 목록. 지금은 지점장 고정석 외에는 완전 랜덤입니다.
  // 규칙 1) 같은 직급은 한 테이블에 최대 MAX_SAME_RANK 명까지
  //   seat.tables = 그 좌석이 속한 "테이블" 번호 목록
  //   (직사각형: 붙여 놓은 4인 테이블 4개 / 원형: 나란히 앉은 4자리 묶음)
  var MAX_SAME_RANK = 2;
  var rankSpreadRule = {
    name: '같은 직급은 한 테이블에 ' + MAX_SAME_RANK + '명까지',
    validate: function (assignment) {
      var count = {};
      return assignment.every(function (a) {
        return a.seat.tables.every(function (tb) {
          var key = tb + '|' + a.person.rank;
          count[key] = (count[key] || 0) + 1;
          return count[key] <= MAX_SAME_RANK;
        });
      });
    }
  };

  // 규칙 2) 아래 사람들은 서로 떨어져 앉기 (이름을 추가/삭제하면 됩니다)
  //   seat.near = "붙어 있다"고 보는 좌석 번호 목록
  //   (직사각형: 같은 4인 테이블 + 바로 옆자리 / 원형: 양옆으로 2칸 이내)
  var KEEP_APART = ['이승석', '양만형', '이용진', '이창현'];
  var keepApartRule = {
    name: '특정 인원 떨어뜨리기',
    validate: function (assignment) {
      var group = assignment.filter(function (a) { return KEEP_APART.indexOf(a.person.name) >= 0; });
      return group.every(function (a) {
        return group.every(function (b) { return a === b || a.seat.near.indexOf(b.seat.id) < 0; });
      });
    }
  };

  // 적용할 규칙 목록. 규칙을 빼려면 해당 줄을 지우거나 // 로 막으면 됩니다.
  var RULES = [
    managerFixedRule,
    rankSpreadRule,
    keepApartRule
    // , separateTeamsRule
    // , fixedSeatRule
  ];

  function shuffle(list, rng) {
    var a = list.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(rng() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  /**
   * 자리 배정 (화면/애니메이션과 무관한 순수 함수)
   * @returns [{ person, seat }, ...]
   */
  function assignSeats(people, seats, rules, rng) {
    rng = rng || Math.random;
    rules = rules || [];
    var ctx = { people: people, seats: seats };
    var MAX_TRIES = 200000;

    // 1) 고정석 먼저
    var fixed = [];
    var usedSeat = {}, usedPerson = {};
    rules.forEach(function (rule) {
      if (!rule.fixed) return;
      rule.fixed(ctx).forEach(function (f) {
        var seat = seats.filter(function (s) { return s.id === f.seatId; })[0];
        if (!seat || usedSeat[seat.id] || usedPerson[f.person.id]) return;
        usedSeat[seat.id] = true;
        usedPerson[f.person.id] = true;
        fixed.push({ person: f.person, seat: seat });
      });
    });

    var freeSeats = seats.filter(function (s) { return !usedSeat[s.id]; });
    var freePeople = people.filter(function (p) { return !usedPerson[p.id]; });
    if (freePeople.length > freeSeats.length) {
      console.warn('좌석보다 사람이 많습니다. 일부 인원은 배정되지 않습니다.');
    }

    // 2) 나머지는 완전 랜덤으로 섞고, 검증 규칙을 통과할 때까지 반복
    var result = fixed;
    for (var t = 0; t < MAX_TRIES; t++) {
      var ps = shuffle(freePeople, rng);
      var ss = shuffle(freeSeats, rng);
      var n = Math.min(ps.length, ss.length);
      result = fixed.slice();
      for (var i = 0; i < n; i++) result.push({ person: ps[i], seat: ss[i] });
      var ok = rules.every(function (rule) {
        return !rule.validate || rule.validate(result, ctx);
      });
      if (ok) { assignSeats.lastTries = t + 1; return result; }
    }
    assignSeats.lastTries = -1;
    console.warn('규칙을 모두 만족하는 배치를 찾지 못해 마지막 배치를 사용합니다.');
    return result;
  }

  /* ==========================================================
   * 3. 픽셀 캐릭터 그리기
   * ----------------------------------------------------------
   * 16 x 20 칸 기준. (ox, oy) 는 왼쪽 위.
   * opts: { dir: 'front'|'back'|'left'|'right', frame: 0|1|2, sit: bool }
   * 생김새 항목은 characters.js 맨 위 설명을 참고하세요.
   * ========================================================== */
  function hexToRgb(h) {
    h = String(h).replace('#', '');
    if (h.length === 3) h = h.replace(/(.)/g, '$1$1');
    var n = parseInt(h, 16) || 0;
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  var mixCache = {};
  function mix(a, b, t) {
    var key = a + b + t;
    if (mixCache[key]) return mixCache[key];
    var A = hexToRgb(a), B = hexToRgb(b);
    var out = '#' + A.map(function (v, i) {
      var n = Math.round(v + (B[i] - v) * t).toString(16);
      return n.length < 2 ? '0' + n : n;
    }).join('');
    mixCache[key] = out;
    return out;
  }

  function drawCharacter(ctx, c, ox, oy, opts) {
    opts = opts || {};
    var dir = opts.dir || 'front';
    var frame = opts.frame || 0;
    var sit = !!opts.sit;
    var mirror = dir === 'left';
    var side = dir === 'left' || dir === 'right';
    var front = dir === 'front', back = dir === 'back';

    var skin = SKIN_TONES[c.skinTone] || c.skinTone || SKIN_TONES.fair;
    var hair = HAIR_COLORS[c.hairColor] || c.hairColor || HAIR_COLORS.black;
    var cloth = c.clothColor || '#5a8fd0';
    var inner = c.innerColor || '#f4f4f0';
    var legCol = c.pantsColor || '#3b3f5c';
    var clothD = mix(cloth, '#16203a', 0.24);
    var clothL = mix(cloth, '#ffffff', 0.35);
    var hairL = mix(hair, '#ffffff', 0.22);
    var hairD = mix(hair, '#000000', 0.28);
    var hairS = mix(hair, skin, 0.38);              // 아주 짧게 깎은 부분
    var eyes = c.eyes || 'normal';
    var blush = mix(skin, '#e8605a', eyes === 'normal' ? 0.34 : 0.5);
    var mouth = eyes === 'normal' ? mix(skin, '#6b1f1f', 0.55) : '#d25a66';
    var EYE = '#2b2030', SHOE = '#2a2230';

    var style = c.hairStyle || 'short';
    var top = c.top || 'tee';
    var build = c.build || 'normal';
    var bottom = c.bottom || 'pants';
    var shortSleeve = c.sleeve ? c.sleeve === 'short' : top === 'tee';
    var tall = c.height === 'tall' ? 1 : 0;
    var glasses = c.glasses === true ? 'round' : c.glasses;
    var FRAME = c.glassesFrame === 'metal' ? '#8f9bb0' : '#8a5634';

    var isLong = style === 'long' || style === 'longPart' || style === 'longWave';
    var isMed = style === 'permPart';
    var isBob = style === 'bob' || style === 'bobPart';
    var noBangs = style === 'longPart' || style === 'longWave' || style === 'permPart' || style === 'bobPart';

    oy -= tall;
    function P(x, y, w, h, col) {
      ctx.fillStyle = col;
      ctx.fillRect(ox + (mirror ? 16 - x - w : x), oy + y, w, h);
    }

    // 몸통 폭 (체형)
    var tx, tw;
    if (side) {
      tx = build === 'slim' ? 6 : (build === 'chubby' || build === 'muscular') ? 4 : 5;
      tw = build === 'slim' ? 5 : build === 'chubby' ? 8 : build === 'muscular' ? 7 : 6;
    } else {
      tx = build === 'slim' ? 5 : (build === 'chubby' || build === 'muscular') ? 3 : 4;
      tw = 16 - tx * 2;
    }
    var hipX = side ? tx : (build === 'chubby' ? 3 : build === 'slim' ? 5 : 4);
    var hipW = side ? tw : 16 - hipX * 2;
    var legLen = 3 + tall, footY = 16 + legLen;

    if (!sit) P(3, footY, 10, 2, 'rgba(20,40,70,0.2)');     // 그림자

    /* ---------- 뒤로 넘어가는 머리 (몸보다 먼저) ---------- */
    if (front) {
      if (isLong) P(2, 3, 12, 13, hairD);
      if (isMed) P(1, 3, 14, 10, hairD);
      if (isBob) P(2, 3, 12, 8, hairD);
      if (style === 'ponytail') { P(13, 3, 2, 3, hair); P(14, 6, 1, 6, hairD); }
    }

    /* ---------- 다리 ---------- */
    if (sit) {
      P(hipX, 16, hipW, 1 + tall, legCol);
    } else if (side) {
      var lcs = bottom === 'skirt' ? skin : legCol;
      if (bottom === 'longskirt') {
        P(tx, 16, tw, legLen, legCol);
        P(tx + 1, footY, frame ? tw : tw - 1, 1, SHOE);
      } else if (frame === 0) {
        P(6, 16, 3, legLen, lcs); P(6, footY, 4, 1, SHOE);
      } else {
        P(6, 16, 3, 1, lcs);
        P(5, 17, 2, legLen - 1, lcs); P(9, 17, 2, legLen - 1, lcs);
        P(5, footY, 2, 1, SHOE); P(9, footY, 3, 1, SHOE);
      }
      if (bottom === 'skirt') P(tx, 16, tw, 2, legCol);
    } else {
      var lw = build === 'chubby' ? 3 : 2, lx = build === 'chubby' ? 4 : 5, rx = 9;
      if (bottom === 'longskirt') {
        P(5, 16, 6, legLen, legCol);
        P(5, footY - (frame === 1 ? 1 : 0), 2, 1, SHOE); P(9, footY - (frame === 2 ? 1 : 0), 2, 1, SHOE);
      } else {
        var lc = bottom === 'skirt' ? skin : legCol;
        var n1 = legLen - (frame === 1 ? 1 : 0), n2 = legLen - (frame === 2 ? 1 : 0);
        P(lx, 16, rx + lw - lx, 1, lc);
        P(lx, 16, lw, n1, lc); P(lx, 16 + n1, lw, 1, SHOE);
        P(rx, 16, lw, n2, lc); P(rx, 16 + n2, lw, 1, SHOE);
        if (bottom === 'skirt') P(hipX, 16, hipW, 2, legCol);
      }
    }

    /* ---------- 몸통 + 팔 ---------- */
    var x, y;
    if (!side && build === 'muscular') { P(3, 11, 10, 3, cloth); P(4, 14, 8, 2, cloth); }
    else P(tx, 11, tw, 5, cloth);

    if (top === 'stripe') for (x = tx + 1; x < tx + tw; x += 2) P(x, 11, 1, 5, inner);
    if (top === 'knit') for (y = 12; y < 16; y++) for (x = tx + (y % 2); x < tx + tw; x += 2) P(x, y, 1, 1, clothL);
    if (top === 'sweat') P(side ? tx : (build === 'muscular' ? 4 : tx), 15, side ? tw : (build === 'muscular' ? 8 : tw), 1, clothD);
    if (top === 'offshoulder') { P(tx, 11, tw, 1, skin); P(tx, 12, tw, 1, clothL); }

    function arm(ax, w) {
      if (top === 'offshoulder') { P(ax, 11, w, 1, skin); P(ax, 12, w, 3, clothD); P(ax, 15, w, 1, skin); }
      else if (shortSleeve) { P(ax, 11, w, 2, clothD); P(ax, 13, w, 3, skin); }
      else { P(ax, 11, w, 4, clothD); P(ax, 15, w, 1, skin); if (top === 'sweat') P(ax, 14, w, 1, clothL); }
    }
    if (side) {
      if (top === 'cardigan' || top === 'jacket') P(tx + tw - 2, 11, 2, 5, inner);
      arm(tx + 2, 2);
    } else {
      arm(tx - 1, 1); arm(tx + tw, 1);
    }

    if (front) {
      switch (top) {
        case 'shirt': case 'stripe':
          P(7, 11, 2, 1, skin); P(6, 11, 1, 1, clothD); P(9, 11, 1, 1, clothD); P(8, 12, 1, 4, clothD); break;
        case 'polo':
          P(7, 11, 2, 1, skin); P(6, 11, 1, 1, clothL); P(9, 11, 1, 1, clothL); P(8, 12, 1, 2, clothL); break;
        case 'tee':
          P(7, 11, 2, 1, skin); break;
        case 'sweat': case 'knit':
          P(6, 11, 4, 1, clothD); break;
        case 'cardigan':
          P(6, 11, 4, 5, inner); P(7, 11, 2, 1, skin); break;
        case 'jacket':
          P(7, 11, 2, 4, inner); P(7, 11, 2, 1, skin); P(6, 11, 1, 3, clothD); P(9, 11, 1, 3, clothD); P(8, 15, 1, 1, clothD); break;
        case 'zipup':
          P(6, 11, 4, 1, clothD); P(8, 12, 1, 4, '#e6ecf0'); break;
        case 'blouse':
          P(7, 11, 2, 1, skin); P(6, 11, 1, 1, clothL); P(9, 11, 1, 1, clothL); P(7, 12, 2, 1, clothL); break;
      }
    }

    /* ---------- 머리(얼굴) ---------- */
    if (c.face === 'oval') { P(4, 2, 8, 8, skin); P(3, 3, 10, 6, skin); P(5, 10, 6, 1, skin); }
    else { P(4, 2, 8, 9, skin); P(3, 3, 10, 7, skin); }
    if (build === 'chubby' && !side) { P(2, 6, 1, 3, skin); P(13, 6, 1, 3, skin); }

    if (front) {
      if (eyes === 'big') {
        P(5, 6, 2, 2, EYE); P(9, 6, 2, 2, EYE); P(5, 6, 1, 1, '#ffffff'); P(9, 6, 1, 1, '#ffffff');
      } else {
        P(5, 6, 1, 2, EYE); P(10, 6, 1, 2, EYE);
        if (eyes === 'pretty') { P(4, 6, 1, 1, EYE); P(11, 6, 1, 1, EYE); }
      }
      P(4, 8, 1, 1, blush); P(11, 8, 1, 1, blush);
      P(7, 9, 2, 1, mouth);
    } else if (side) {
      P(10, 6, 1, 2, EYE);
      if (eyes === 'pretty') P(11, 6, 1, 1, EYE);
      P(10, 8, 1, 1, blush);
      P(11, 9, 1, 1, mouth);
    }

    /* ---------- 머리카락 ---------- */
    function capStd() {
      P(4, 1, 8, 1, hair); P(3, 2, 10, 2, hair);
      P(3, 4, 1, 2, hair); P(12, 4, 1, 2, hair);
      P(5, 2, 2, 1, hairL);
    }
    function bumps() { P(4, 0, 2, 1, hair); P(7, 0, 2, 1, hair); P(10, 0, 2, 1, hair); }
    function spikes() { P(4, 0, 1, 1, hair); P(6, 0, 2, 1, hair); P(9, 0, 1, 1, hair); P(11, 0, 1, 1, hair); }

    if (front) {
      switch (style) {
        case 'bald':
          P(3, 4, 1, 3, hair); P(12, 4, 1, 3, hair); P(6, 3, 2, 1, mix(skin, '#ffffff', 0.5)); break;
        case 'buzz':
          P(4, 1, 8, 1, hairS); P(3, 2, 10, 2, hairS); P(3, 4, 1, 1, hairS); P(12, 4, 1, 1, hairS); break;
        case 'up':
          P(5, -1, 5, 1, hair); P(4, 0, 8, 1, hair); P(3, 1, 10, 2, hair);
          P(3, 3, 2, 1, hair); P(11, 3, 2, 1, hair); P(3, 4, 1, 1, hair); P(12, 4, 1, 1, hair);
          P(6, 0, 3, 1, hairL); break;
        case 'waveUp':
          P(3, -1, 2, 1, hair); P(6, -1, 3, 1, hair); P(10, -1, 2, 1, hair);
          P(2, 0, 12, 3, hair); P(2, 3, 2, 3, hair); P(12, 3, 2, 3, hair); P(4, 3, 1, 1, hair); P(11, 3, 1, 1, hair);
          P(4, 0, 2, 1, hairL); P(8, 1, 2, 1, hairL); P(11, 0, 1, 1, hairL); break;
        case 'sanggo':
          P(4, 1, 8, 1, hair); P(3, 2, 10, 2, hair);
          P(3, 3, 1, 3, hairS); P(12, 3, 1, 3, hairS); P(5, 1, 3, 1, hairL); break;
        case 'partPerm':
          P(4, 0, 3, 1, hair); P(8, 0, 4, 1, hair); P(2, 1, 12, 3, hair);
          P(2, 4, 2, 2, hair); P(12, 4, 2, 2, hair); P(4, 4, 2, 1, hair); P(8, 4, 4, 1, hair); P(10, 5, 2, 1, hair);
          P(7, 1, 1, 3, hairD); P(4, 1, 2, 1, hairL); P(9, 2, 2, 1, hairL); break;
        case 'shaggy':
          P(4, 0, 2, 1, hair); P(8, 0, 3, 1, hair); P(2, 1, 12, 3, hair);
          P(2, 4, 1, 3, hair); P(13, 4, 1, 3, hair); P(3, 4, 10, 1, hair);
          P(3, 5, 2, 1, hair); P(6, 5, 1, 1, hair); P(9, 5, 1, 1, hair); P(11, 5, 2, 1, hair);
          P(5, 1, 2, 1, hairL); break;
        case 'bowl':
          P(4, 1, 8, 1, hair); P(3, 2, 10, 4, hair); P(2, 3, 1, 3, hair); P(13, 3, 1, 3, hair);
          P(4, 2, 6, 1, hairL); break;
        case 'down':
          capStd(); P(3, 4, 10, 1, hair); P(3, 5, 2, 1, hair); P(11, 5, 2, 1, hair); break;
        case 'downMid':
          capStd(); P(3, 4, 10, 1, hair); P(3, 5, 3, 1, hair); P(10, 5, 3, 1, hair);
          P(2, 3, 1, 4, hair); P(13, 3, 1, 4, hair); break;
        case 'part':
          capStd(); P(3, 4, 4, 1, hair); P(8, 4, 5, 1, hair); break;
        case 'bangs': case 'bob': case 'long':
          capStd(); P(3, 4, 10, 1, hair); P(3, 5, 1, 1, hair); P(12, 5, 1, 1, hair); break;
        case 'ponytail':
          capStd(); P(4, 4, 2, 1, hair); P(10, 4, 2, 1, hair); P(13, 3, 1, 1, '#3d6fb0'); break;
        case 'bun':
          capStd(); P(6, -1, 4, 2, hair); P(7, -1, 1, 1, hairL); P(4, 4, 3, 1, hair); P(9, 4, 3, 1, hair); break;
        case 'curly':
          P(2, 1, 12, 3, hair); bumps();
          P(2, 4, 2, 3, hair); P(12, 4, 2, 3, hair); P(5, 4, 1, 1, hair); P(8, 4, 1, 1, hair); P(10, 4, 1, 1, hair);
          P(5, 1, 2, 1, hairL); break;
        case 'spiky':
          capStd(); spikes(); P(5, 4, 1, 1, hair); P(8, 4, 2, 1, hair); break;
        case 'longPart': case 'longWave': case 'permPart': case 'bobPart':
          // 앞머리 없이 가운데 가르마 (이마가 보임)
          P(4, 1, 8, 1, hair); P(3, 2, 10, 1, hair); P(3, 3, 3, 1, hair); P(10, 3, 3, 1, hair);
          P(3, 4, 2, 1, hair); P(11, 4, 2, 1, hair); P(3, 5, 1, 1, hair); P(12, 5, 1, 1, hair);
          P(8, 1, 1, 2, hairD); P(5, 1, 2, 1, hairL); break;
        default:
          capStd();
      }
      // 어깨 앞으로 내려오는 머리
      if (style === 'long') { P(2, 3, 2, 12, hair); P(12, 3, 2, 12, hair); }
      if (style === 'bob') { P(2, 3, 2, 7, hair); P(12, 3, 2, 7, hair); }
      if (style === 'longPart') { P(2, 3, 2, 12, hair); P(12, 3, 2, 12, hair); P(2, 4, 1, 8, hairL); }
      if (style === 'longWave') {
        P(2, 3, 2, 12, hair); P(12, 3, 2, 12, hair);
        P(1, 6, 1, 3, hair); P(14, 9, 1, 3, hair); P(1, 12, 1, 2, hair); P(14, 4, 1, 2, hair);
        P(4, 13, 1, 2, hair); P(11, 12, 1, 2, hair);
        P(2, 7, 1, 2, hairL); P(13, 10, 1, 2, hairL); P(13, 5, 1, 1, hairL); P(2, 12, 1, 1, hairL);
      }
      if (style === 'permPart') {
        P(1, 3, 3, 9, hair); P(12, 3, 3, 9, hair);
        P(0, 5, 1, 2, hair); P(15, 7, 1, 2, hair); P(0, 9, 1, 2, hair); P(15, 4, 1, 1, hair);
        P(2, 5, 1, 1, hairL); P(13, 8, 1, 1, hairL); P(1, 10, 1, 1, hairL); P(14, 5, 1, 1, hairL);
      }
      if (style === 'bobPart') { P(2, 3, 2, 7, hair); P(12, 3, 2, 7, hair); P(3, 10, 1, 1, hair); P(12, 10, 1, 1, hair); P(2, 5, 1, 2, hairL); }
    } else if (back) {
      if (style === 'bald') P(3, 5, 10, 3, hair);
      else if (style === 'buzz') { P(4, 1, 8, 1, hairS); P(3, 2, 10, 6, hairS); }
      else { P(4, 1, 8, 1, hair); P(3, 2, 10, 7, hair); P(4, 9, 8, 1, hair); P(5, 2, 2, 1, hairL); }
      if (style === 'up') { P(5, -1, 5, 1, hair); P(4, 0, 8, 1, hair); }
      if (style === 'waveUp') { P(3, -1, 2, 1, hair); P(6, -1, 3, 1, hair); P(10, -1, 2, 1, hair); P(2, 0, 12, 5, hair); }
      if (style === 'sanggo') { P(3, 6, 10, 3, hairS); P(4, 9, 8, 1, hairS); }
      if (style === 'bowl') P(2, 3, 12, 4, hair);
      if (style === 'downMid') P(2, 3, 12, 5, hair);
      if (style === 'partPerm' || style === 'shaggy' || style === 'curly') { P(2, 1, 12, 8, hair); bumps(); }
      if (isBob) P(2, 3, 12, 8, hair);
      if (isLong) { P(2, 3, 12, 12, hair); P(3, 15, 10, 1, hairD); }
      if (isMed) { P(1, 3, 14, 10, hair); P(0, 5, 1, 2, hair); P(15, 7, 1, 2, hair); P(3, 6, 2, 1, hairL); P(10, 9, 2, 1, hairL); }
      if (style === 'longWave') { P(1, 6, 1, 3, hair); P(14, 9, 1, 3, hair); P(4, 8, 2, 1, hairL); P(9, 11, 2, 1, hairL); }
      if (style === 'ponytail') { P(7, 3, 2, 1, '#3d6fb0'); P(7, 4, 2, 9, hairD); }
      if (style === 'bun') P(6, -1, 4, 2, hair);
      if (style === 'spiky') spikes();
    } else {
      // 옆모습 (오른쪽을 보는 기준, 왼쪽은 좌우 반전)
      if (style === 'bald') P(3, 5, 4, 3, hair);
      else if (style === 'buzz') { P(4, 1, 8, 1, hairS); P(3, 2, 10, 2, hairS); P(3, 4, 4, 4, hairS); }
      else {
        P(4, 1, 8, 1, hair); P(3, 2, 10, 2, hair);
        P(3, 4, 5, 5, hair); P(4, 9, 3, 1, hair);
        P(6, 2, 2, 1, hairL);
      }
      if (style === 'up') { P(4, 0, 8, 1, hair); P(8, -1, 4, 1, hair); }
      if (style === 'waveUp') { P(2, 0, 12, 2, hair); P(4, -1, 2, 1, hair); P(8, -1, 4, 1, hair); P(2, 2, 2, 5, hair); }
      if (style === 'sanggo') { P(3, 6, 5, 3, hairS); P(4, 9, 3, 1, hairS); }
      if (style === 'part' || style === 'bangs' || style === 'bob' || style === 'long' ||
          style === 'down' || style === 'downMid' || style === 'partPerm' || style === 'shaggy') P(8, 4, 4, 1, hair);
      if (style === 'bowl') P(8, 4, 5, 2, hair);
      if (style === 'partPerm' || style === 'shaggy' || style === 'curly') { P(2, 1, 12, 3, hair); P(2, 4, 6, 6, hair); bumps(); }
      if (isBob) P(2, 3, 5, 8, hair);
      if (isLong) P(2, 3, 4, 13, hair);
      if (isMed) { P(1, 3, 6, 10, hair); P(0, 5, 1, 2, hair); P(0, 9, 1, 2, hair); }
      if (style === 'longWave') { P(1, 6, 1, 3, hair); P(1, 12, 1, 2, hair); P(3, 8, 1, 2, hairL); }
      if (noBangs) P(8, 4, 2, 1, skin);
      if (style === 'ponytail') { P(2, 3, 1, 1, '#3d6fb0'); P(1, 4, 2, 7, hairD); }
      if (style === 'bun') P(4, -1, 4, 2, hair);
      if (style === 'spiky') spikes();
    }

    /* ---------- 안경 (머리카락 위에) ---------- */
    if (glasses && front) {
      // 렌즈 안쪽은 밝게 비치고 눈이 보이도록 (선글라스처럼 보이지 않게)
      var big = glasses === 'bigRound', sq = glasses === 'square';
      var gt = big ? 4 : 5, LENS = mix(skin, '#ffffff', 0.6);
      [3, 9].forEach(function (gx) {
        P(gx + 1, gt + 1, 2, 7 - gt, LENS);
        P(gx + (sq ? 0 : 1), gt, sq ? 4 : 2, 1, FRAME); P(gx + (sq ? 0 : 1), 8, sq ? 4 : 2, 1, FRAME);
        P(gx, gt + 1, 1, 7 - gt, FRAME); P(gx + 3, gt + 1, 1, 7 - gt, FRAME);
      });
      P(7, 6, 2, 1, FRAME);
      P(5, 6, 1, 2, EYE); P(10, 6, 1, 2, EYE);
    } else if (glasses && side) {
      P(9, 5, 3, 1, FRAME); P(9, 8, 3, 1, FRAME); P(9, 6, 1, 2, FRAME); P(11, 6, 1, 2, FRAME);
      P(6, 6, 3, 1, FRAME);
    }

    /* ---------- 지점장님 왕관 ---------- */
    if (c.isManager) {
      var G = '#f5c542', GD = '#c9952a';
      var cy = (style === 'up' || style === 'waveUp') ? -3 : -2;
      P(5, cy, 6, 2, G); P(5, cy + 1, 6, 1, GD);
      P(5, cy - 1, 1, 1, G); P(7, cy - 1, 2, 1, G); P(10, cy - 1, 1, 1, G);
      P(7, cy, 2, 1, '#d9463e');
    }
  }

  /* ==========================================================
   * 4. 테이블 배치
   * ----------------------------------------------------------
   * seat.x, seat.y = 앉은 캐릭터의 중심(아트 픽셀)
   * 앉은 캐릭터의 발밑(base)은 y + 8
   * 입구는 화면 아래쪽 가운데, 지점장석은 그 맞은편(위쪽)
   * ========================================================== */
  function facingToward(x, y, cx, cy) {
    var dx = cx - x, dy = cy - y;
    if (Math.abs(dx) > Math.abs(dy) * 1.3) return dx > 0 ? 'right' : 'left';
    return dy > 0 ? 'front' : 'back';
  }

  // 원형: 0번 = 맨 위(지점장석), 시계 방향으로 1 ~ 17번
  function buildRoundLayout() {
    var N = 18, cx = 160, cy = 126, R = 64;
    var ringCx = cx, ringCy = cy + 8, ringR = 80;   // 걸어 다니는 통로
    var seats = [];
    for (var i = 0; i < N; i++) {
      var a = -Math.PI / 2 + i * 2 * Math.PI / N;
      var x = cx + R * Math.cos(a), y = cy + R * Math.sin(a);
      seats.push({
        id: i, x: Math.round(x), y: Math.round(y), angle: a,
        isManagerSeat: i === 0,
        adjacent: [(i + N - 1) % N, (i + 1) % N],
        // 원형은 큰 테이블 하나이므로, 나란히 앉은 4자리를 "한 테이블"로 봅니다
        tables: [i, (i + N - 1) % N, (i + N - 2) % N, (i + N - 3) % N],
        near: [(i + N - 2) % N, (i + N - 1) % N, (i + 1) % N, (i + 2) % N],
        facing: facingToward(x, y, cx, cy)
      });
    }
    return {
      type: 'round', title: '원형 테이블', seats: seats, labelMaxW: 84,
      pathTo: function (seat) {
        var pts = [[DOOR.x, 222], [ringCx, ringCy + ringR]];
        var a0 = Math.PI / 2, d = seat.angle - a0;
        while (d > Math.PI) d -= 2 * Math.PI;
        while (d < -Math.PI) d += 2 * Math.PI;
        var steps = Math.ceil(Math.abs(d) / (Math.PI / 24));
        for (var k = 1; k <= steps; k++) {
          var a = a0 + d * k / steps;
          pts.push([ringCx + ringR * Math.cos(a), ringCy + ringR * Math.sin(a)]);
        }
        pts.push([seat.x, seat.y + 8]);
        return pts;
      },
      labelPos: function (seat, w) {
        var c = Math.cos(seat.angle), s = Math.sin(seat.angle);
        return { x: seat.x * PX + c * (30 + w / 2), y: seat.y * PX + s * 45 - (s < 0 ? 4 : 0) };
      },
      drawTable: drawRoundTable
    };
  }

  // 직사각형: 위쪽 줄 0~7(왼→오), 오른쪽 끝 8, 아래쪽 줄 9~16(오→왼), 왼쪽 끝 17
  //           지점장석 = 3번 (입구 맞은편 긴 변의 왼쪽에서 4번째)
  function buildRectLayout() {
    var N = 18, x0 = 48, top = 108, bottom = 144, cy = 126;
    var STEP = 28;                                  // 좌석 간격
    var yTop = 98, yBot = 156, xL = 36, xR = 284;
    var walk = { l: 22, r: 298, t: 86, b: 188 };    // 걸어 다니는 통로
    var seats = [], i;
    for (i = 0; i < 8; i++) seats.push({ x: x0 + STEP / 2 + i * STEP, y: yTop, side: 'top' });
    seats.push({ x: xR, y: cy - 2, side: 'right' });
    for (i = 7; i >= 0; i--) seats.push({ x: x0 + STEP / 2 + i * STEP, y: yBot, side: 'bottom' });
    seats.push({ x: xL, y: cy - 2, side: 'left' });
    seats.forEach(function (s, id) {
      s.id = id;
      s.isManagerSeat = id === 3;
      s.adjacent = [(id + N - 1) % N, (id + 1) % N];
      // 4인 테이블 번호 (왼쪽부터 0~3). 양 끝자리는 가장 가까운 끝 테이블에 포함
      s.tables = [s.side === 'left' ? 0 : s.side === 'right' ? 3 : Math.floor((s.x - x0) / (STEP * 2))];
      s.facing = { top: 'front', bottom: 'back', left: 'right', right: 'left' }[s.side];
    });
    seats.forEach(function (s) {
      s.near = seats.filter(function (o) {
        return o !== s && (o.tables[0] === s.tables[0] || s.adjacent.indexOf(o.id) >= 0);
      }).map(function (o) { return o.id; });
    });
    return {
      type: 'rect', title: '직사각형 테이블', seats: seats, labelMaxW: 82,
      rect: { x: x0, y: top, w: STEP * 8, h: bottom - top },
      pathTo: function (seat) {
        var pts = [[DOOR.x, 222], [DOOR.x, walk.b]];
        var sx = seat.x, base = seat.y + 8;
        if (seat.side === 'bottom') {
          pts.push([sx, walk.b]);
        } else {
          var wx = sx < 160 ? walk.l : walk.r;
          pts.push([wx, walk.b]);
          if (seat.side === 'top') { pts.push([wx, walk.t]); pts.push([sx, walk.t]); }
          else pts.push([wx, base]);
        }
        pts.push([sx, base]);
        return pts;
      },
      labelPos: function (seat) {
        if (seat.isManagerSeat) return { x: seat.x * PX, y: seat.y * PX - 58, maxW: 120 };   // 왕관 위로
        return { x: seat.x * PX, y: seat.y * PX + (seat.side === 'top' ? -44 : 38) };
      },
      drawTable: drawRectTable
    };
  }

  /* ==========================================================
   * 5. 배경 / 테이블 / 소품  (푸른빛 횟집)
   * ========================================================== */
  function R(ctx, x, y, w, h, col) { ctx.fillStyle = col; ctx.fillRect(x, y, w, h); }

  function ellipse(ctx, cx, cy, rx, ry, col) {
    ctx.fillStyle = col;
    for (var dy = -ry; dy <= ry; dy++) {
      var w = Math.round(rx * Math.sqrt(1 - (dy * dy) / (ry * ry + 0.01)));
      ctx.fillRect(cx - w, cy + dy, w * 2 + 1, 1);
    }
  }
  function disc(ctx, cx, cy, r, col) { ellipse(ctx, cx, cy, r, r, col); }

  function seededRandom(seed) {
    return function () {
      seed |= 0; seed = seed + 0x6D2B79F5 | 0;
      var t = Math.imul(seed ^ seed >>> 15, 1 | seed);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  var NAVY = '#16305a', BLUE_D = '#1f3f6e', BLUE = '#2c5a94', BLUE_L = '#7fb6e0';
  var TANKS = [{ x: 12, y: 7, w: 92, h: 19 }, { x: 216, y: 7, w: 92, h: 19 }];   // 수족관
  var BASINS = [{ x: 11, y: 132, rim: '#c9363a' }, { x: 309, y: 132, rim: '#2c6fb5' }]; // 고무 대야
  var FISH_COLORS = ['#f58b5b', '#e8eef2', '#f6cf4a', '#c9d6de', '#f2a0a0'];

  function drawRoom(ctx) {
    var rnd = seededRandom(11), x, y, i;

    /* 바깥 바닥: 푸른 타일 */
    R(ctx, 0, 32, ART_W, ART_H - 32, '#b4cddd');
    for (y = 32; y < ART_H; y += 8) for (x = 0; x < ART_W; x += 8) {
      if (((x + y) / 8) % 2 === 0) R(ctx, x, y, 8, 8, '#c2d8e6');
      R(ctx, x, y, 8, 1, '#a9c4d6');
    }

    /* 좌식 마루 (노란 장판) */
    R(ctx, 21, 41, 278, 183, '#6b5035');
    R(ctx, 22, 42, 276, 180, '#9a7a52');
    R(ctx, 24, 44, 272, 176, '#eadcae');
    for (y = 44 + 44; y < 220; y += 44) R(ctx, 24, y, 272, 1, '#d9c995');
    for (x = 24 + 68; x < 296; x += 68) R(ctx, x, 44, 1, 176, '#dfd09d');
    for (i = 0; i < 260; i++) {
      R(ctx, 25 + Math.floor(rnd() * 269), 45 + Math.floor(rnd() * 174), 2, 1, rnd() < 0.5 ? '#f3e8c2' : '#dfcf9c');
    }
    R(ctx, 24, 44, 272, 2, 'rgba(20,40,70,0.10)');

    /* 뒷벽: 흰 타일 + 파란 띠 */
    R(ctx, 0, 0, ART_W, 32, '#eaf4f9');
    for (x = 0; x < ART_W; x += 8) R(ctx, x, 4, 1, 23, '#d3e6f0');
    for (y = 11; y < 27; y += 8) R(ctx, 0, y, ART_W, 1, '#d3e6f0');
    R(ctx, 0, 0, ART_W, 3, BLUE_D); R(ctx, 0, 3, ART_W, 1, NAVY);
    R(ctx, 0, 27, ART_W, 5, BLUE);
    for (x = 0; x < ART_W; x += 6) { R(ctx, x, 28, 3, 1, BLUE_L); R(ctx, x + 3, 29, 3, 1, BLUE_L); }
    R(ctx, 0, 31, ART_W, 1, NAVY);
    R(ctx, 0, 32, ART_W, 2, 'rgba(20,40,70,0.16)');

    /* 수족관 2개 */
    TANKS.forEach(function (t, n) {
      R(ctx, t.x - 2, t.y - 2, t.w + 4, t.h + 4, NAVY);
      R(ctx, t.x - 1, t.y - 1, t.w + 2, t.h + 2, '#9fb3c4');
      R(ctx, t.x, t.y, t.w, t.h, '#3f9ad6');
      R(ctx, t.x, t.y, t.w, 3, '#8fd0f2'); R(ctx, t.x, t.y + 3, t.w, 3, '#5fb2e4');
      R(ctx, t.x, t.y + 11, t.w, 5, '#3189c8');
      R(ctx, t.x, t.y + t.h - 3, t.w, 3, '#e6d6a0'); R(ctx, t.x, t.y + t.h - 3, t.w, 1, '#f3e8c2');
      for (i = 0; i < 7; i++) {
        var sx = t.x + 5 + Math.floor(rnd() * (t.w - 10));
        if (i < 4) { R(ctx, sx, t.y + t.h - 9, 1, 6, '#3f9a5a'); R(ctx, sx + 1, t.y + t.h - 7, 1, 4, '#5fb56a'); R(ctx, sx - 1, t.y + t.h - 6, 1, 3, '#5fb56a'); }
        else { R(ctx, sx, t.y + t.h - 4, 4, 2, '#8a97a6'); R(ctx, sx + 1, t.y + t.h - 5, 2, 1, '#a9b6c4'); }
      }
      R(ctx, t.x + 2, t.y + 1, 1, 7, '#d6f0fc'); R(ctx, t.x + 4, t.y + 1, 1, 4, '#d6f0fc');
      R(ctx, t.x + (n ? 4 : t.w - 12), t.y - 2, 8, 1, '#5aa7d8');
    });

    /* 가운데 간판 + 세로 메뉴판 */
    R(ctx, 117, 4, 86, 22, NAVY);
    R(ctx, 119, 6, 82, 18, '#1f4f8f');
    R(ctx, 120, 7, 80, 1, BLUE_L); R(ctx, 120, 22, 80, 1, BLUE_L);
    [108, 207].forEach(function (px, n) {
      R(ctx, px, 6, 6, 19, '#ffffff'); R(ctx, px, 6, 6, 1, BLUE); R(ctx, px, 24, 6, 1, BLUE);
      for (var q = 0; q < 5; q++) R(ctx, px + 1 + ((q + n) % 2), 9 + q * 3, 3 - ((q + n) % 2), 1, BLUE_D);
    });

    /* 음료 냉장고 (오른쪽 위) */
    R(ctx, 302, 67, 17, 2, 'rgba(20,40,70,0.22)');
    R(ctx, 302, 36, 16, 32, '#9aa8b4'); R(ctx, 303, 37, 14, 30, '#e8eef2');
    R(ctx, 303, 37, 14, 4, BLUE); R(ctx, 305, 38, 6, 1, '#ffffff');
    R(ctx, 304, 42, 12, 23, '#cfe6f2');
    for (i = 0; i < 3; i++) {
      var fy = 43 + i * 8;
      R(ctx, 304, fy + 6, 12, 1, '#9aa8b4');
      for (x = 305; x < 315; x += 2) R(ctx, x, fy + 1, 1, 5, i === 1 ? '#7a4a22' : '#3f9a5a');
      for (x = 305; x < 315; x += 2) R(ctx, x, fy + 3, 1, 1, i === 1 ? '#f1e2a8' : '#f4f7f8');
    }
    R(ctx, 316, 48, 1, 8, '#7d8a96');

    /* 소주 박스 (왼쪽 위) */
    R(ctx, 2, 65, 18, 2, 'rgba(20,40,70,0.22)');
    [['#2c6fb5', 54], ['#3f9a5a', 43]].forEach(function (b) {
      R(ctx, 3, b[1], 16, 11, mix(b[0], '#000000', 0.25)); R(ctx, 3, b[1], 16, 10, b[0]);
      R(ctx, 5, b[1] + 3, 12, 2, mix(b[0], '#000000', 0.35)); R(ctx, 5, b[1] + 7, 12, 1, mix(b[0], '#ffffff', 0.3));
    });
    for (x = 5; x < 17; x += 3) { R(ctx, x, 40, 2, 3, '#3f9a5a'); R(ctx, x, 39, 2, 1, '#c9d6de'); }

    /* 고무 대야 */
    BASINS.forEach(function (b) {
      ellipse(ctx, b.x, b.y + 2, 10, 7, 'rgba(20,40,70,0.2)');
      ellipse(ctx, b.x, b.y, 10, 7, mix(b.rim, '#000000', 0.2));
      ellipse(ctx, b.x, b.y - 1, 10, 6, b.rim);
      ellipse(ctx, b.x, b.y - 1, 8, 4, '#4fa6dc');
      R(ctx, b.x - 5, b.y - 3, 4, 1, '#a9dcf5');
    });

    /* 입구 쪽 벽 + 유리 미닫이문 */
    R(ctx, 0, 228, ART_W, 12, BLUE_D); R(ctx, 0, 228, ART_W, 2, BLUE);
    for (x = 10; x < ART_W; x += 20) R(ctx, x, 230, 1, 10, NAVY);
    R(ctx, 124, 226, 72, 14, '#9aa8b4');
    R(ctx, 126, 227, 13, 13, '#bfe0f5'); R(ctx, 181, 227, 13, 13, '#bfe0f5');
    R(ctx, 128, 228, 1, 9, '#eaf7fd'); R(ctx, 183, 228, 1, 9, '#eaf7fd');
    R(ctx, 140, 226, 40, 14, '#a9c4d6');
    R(ctx, 144, 231, 32, 9, '#2c6fb5'); R(ctx, 145, 232, 30, 1, BLUE_L);
    R(ctx, 138, 222, 2, 18, '#dfe8ee'); R(ctx, 180, 222, 2, 18, '#dfe8ee');

    /* 벗어 놓은 신발 */
    [[98, '#2a2230'], [106, '#f4f4f0'], [114, '#7a4a22'], [198, '#2a2230'], [206, '#3d6fb0'], [214, '#f4f4f0'], [90, '#c9363a'], [222, '#2a2230']]
      .forEach(function (s) {
        R(ctx, s[0], 224, 2, 3, s[1]); R(ctx, s[0] + 3, 224, 2, 3, s[1]);
        R(ctx, s[0], 226, 2, 1, mix(s[1], '#000000', 0.3)); R(ctx, s[0] + 3, 226, 2, 1, mix(s[1], '#000000', 0.3));
      });

    /* 화분 */
    [[10, 206], [309, 206]].forEach(function (p) {
      R(ctx, p[0] - 5, p[1] + 9, 11, 2, 'rgba(20,40,70,0.22)');
      disc(ctx, p[0] - 3, p[1] - 4, 4, '#4f8a4c'); disc(ctx, p[0] + 3, p[1] - 5, 4, '#5fa05a'); disc(ctx, p[0], p[1] - 9, 4, '#6fb56a');
      R(ctx, p[0] - 1, p[1] - 3, 2, 5, '#3f6e3c');
      R(ctx, p[0] - 4, p[1] + 1, 9, 2, '#f4f7f8'); R(ctx, p[0] - 3, p[1] + 3, 7, 6, '#dfe8ee'); R(ctx, p[0] - 3, p[1] + 5, 7, 1, BLUE);
    });
  }

  /* 물고기 한 마리 (5 x 3). dirRight: 헤엄치는 방향 */
  function drawFish(ctx, x, y, col, dirRight) {
    var d = dirRight ? 1 : -1;
    R(ctx, x - 1, y, 3, 2, col); R(ctx, x - 1, y - 1, 2, 1, mix(col, '#000000', 0.15));
    R(ctx, x - 2 * d - (d > 0 ? 0 : 0), y, 1, 2, mix(col, '#000000', 0.2));
    R(ctx, x - 3 * d, y - 1, 1, 1, mix(col, '#000000', 0.2)); R(ctx, x - 3 * d, y + 2, 1, 1, mix(col, '#000000', 0.2));
    R(ctx, x + d, y, 1, 1, '#1b2030');
  }

  /* 매 프레임 움직이는 것: 수족관 물고기·물방울, 대야 속 물고기 */
  function drawAmbient(ctx, t) {
    TANKS.forEach(function (tank, n) {
      for (var i = 0; i < 4; i++) {
        var span = tank.w - 14, speed = 5 + i * 1.7 + n;
        var p = (t * speed + i * 37 + n * 19) % (span * 2);
        var right = p < span;
        var fx = Math.round(tank.x + 7 + (right ? p : span * 2 - p));
        var fy = Math.round(tank.y + 4 + i * 3 + Math.sin(t * 1.3 + i * 2) * 1);
        drawFish(ctx, fx, fy, FISH_COLORS[(i + n * 2) % FISH_COLORS.length], right);
      }
      for (var b = 0; b < 3; b++) {
        var by = (t * (5 + b) + b * 5) % 14;
        R(ctx, tank.x + 14 + b * 31 + n * 6, Math.round(tank.y + tank.h - 4 - by), 1, 1, '#eaf7fd');
      }
    });
    BASINS.forEach(function (b, n) {
      var a = t * 0.9 + n * 2;
      drawFish(ctx, Math.round(b.x + Math.cos(a) * 4), Math.round(b.y - 1 + Math.sin(a) * 2), n ? '#f6cf4a' : '#e8eef2', Math.sin(a) < 0);
    });
  }

  /* 글자가 들어가는 간판 (선명하게 보이도록 확대 후에 그림) */
  function drawSigns(ctx, hideMain) {
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    if (!hideMain) {
      ctx.font = 'bold 24px ' + FONT;
      ctx.fillStyle = NAVY; ctx.fillText('노량', 482, 47);
      ctx.fillStyle = '#ffffff'; ctx.fillText('노량', 480, 45);
    }
    ctx.font = 'bold 13px ' + FONT;
    ctx.fillStyle = '#ffffff';
    ctx.fillText('어서오세요', 480, 663);
  }

  /* ---------- 상차림 소품 ---------- */
  var HOE = ['#fbeee6', '#f7b79a', '#f58b5b', '#fbeee6', '#f2c9c0', '#d8414a'];   // 광어·연어·참치 등
  function hoe(ctx, x, y, kind) {                     // 회 한 점 (3 x 2)
    var col = HOE[kind % HOE.length];
    R(ctx, x, y, 3, 2, col); R(ctx, x, y, 3, 1, mix(col, '#ffffff', 0.45)); R(ctx, x + 2, y + 1, 1, 1, mix(col, '#000000', 0.12));
  }
  function sojuBottle(ctx, x, y) {
    R(ctx, x, y + 6, 4, 1, 'rgba(20,40,70,0.25)');
    R(ctx, x + 1, y - 3, 1, 3, '#3f9a5a'); R(ctx, x + 1, y - 4, 1, 1, '#c9d6de');
    R(ctx, x, y, 3, 6, '#3f9a5a'); R(ctx, x, y, 1, 6, '#6fc08a'); R(ctx, x, y + 2, 3, 2, '#f4f7f8'); R(ctx, x + 1, y + 2, 1, 1, '#3d6fb0');
  }
  function beerBottle(ctx, x, y) {
    R(ctx, x, y + 6, 4, 1, 'rgba(20,40,70,0.25)');
    R(ctx, x + 1, y - 3, 1, 3, '#7a4a22'); R(ctx, x, y, 3, 6, '#7a4a22'); R(ctx, x, y + 2, 3, 2, '#f1e2a8'); R(ctx, x + 1, y - 4, 1, 1, '#d9a93a');
  }
  function sojuGlass(ctx, x, y) { R(ctx, x, y, 2, 2, '#eaf7fd'); R(ctx, x, y + 1, 2, 1, '#bcd9e8'); }
  function smallPlate(ctx, x, y, kind) {              // 앞접시 + 초장
    R(ctx, x, y, 5, 3, '#f4f7f8'); R(ctx, x, y + 2, 5, 1, '#c9d6de');
    R(ctx, x + 1, y, 2, 2, HOE[kind % HOE.length]); R(ctx, x + 3, y + 1, 1, 1, '#c9363a');
  }
  function chojang(ctx, x, y) { R(ctx, x, y, 3, 3, '#f4f7f8'); R(ctx, x, y + 1, 3, 1, '#c9363a'); R(ctx, x + 1, y, 1, 1, '#e2574c'); }
  function ssam(ctx, x, y) {                          // 쌈 채소 바구니
    disc(ctx, x, y + 1, 4, '#8a6a45'); disc(ctx, x, y, 4, '#b98d62'); disc(ctx, x, y, 3, '#5fb56a');
    R(ctx, x - 2, y - 1, 2, 2, '#3f9a5a'); R(ctx, x + 1, y, 2, 2, '#7fca7a'); R(ctx, x, y - 2, 1, 1, '#e2574c');
  }
  function stew(ctx, x, y) {                          // 매운탕 냄비
    R(ctx, x - 6, y, 2, 1, '#2a2a30'); R(ctx, x + 5, y, 2, 1, '#2a2a30');
    disc(ctx, x, y + 1, 5, '#1b1b20'); disc(ctx, x, y, 5, '#3a3a42'); disc(ctx, x, y, 4, '#d9502f');
    R(ctx, x - 2, y - 1, 2, 1, '#f4f7f8'); R(ctx, x + 1, y + 1, 2, 1, '#5fb56a'); R(ctx, x, y - 2, 1, 1, '#5fb56a'); R(ctx, x - 1, y + 1, 1, 1, '#f58b5b');
  }

  function drawCushions(ctx, layout) {
    layout.seats.forEach(function (s, i) {
      var col = s.isManagerSeat ? '#e0a92e' : (i % 2 ? '#2c6fb5' : '#5aa7d8');
      var by = s.y + 8;
      ellipse(ctx, s.x, by + 1, 9, 4, 'rgba(20,40,70,0.2)');
      ellipse(ctx, s.x, by, 9, 4, mix(col, '#000000', 0.25));
      ellipse(ctx, s.x, by - 1, 8, 3, col);
      if (s.isManagerSeat) { R(ctx, s.x - 9, by + 4, 2, 2, '#c9363a'); R(ctx, s.x + 8, by + 4, 2, 2, '#c9363a'); }
    });
  }

  function drawRoundTable(ctx, layout) {
    var cx = 160, cy = 126, r = 48, i, a;
    ellipse(ctx, cx, cy + 7, r + 1, r, 'rgba(20,40,70,0.25)');
    disc(ctx, cx, cy + 4, r, '#5c3a21');
    disc(ctx, cx, cy, r, '#8f5d33');
    disc(ctx, cx, cy, r - 2, '#c08a58');
    disc(ctx, cx, cy, r - 14, '#c9935f');
    disc(ctx, cx, cy, r - 15, '#c08a58');
    R(ctx, cx - 30, cy - 34, 12, 1, '#d3a06c'); R(ctx, cx - 36, cy - 28, 6, 1, '#d3a06c');

    // 가운데 모둠회 큰 접시
    disc(ctx, cx, cy + 1, 16, '#9fb3c4');
    disc(ctx, cx, cy, 16, '#f4f7f8');
    disc(ctx, cx, cy, 14, '#2c6fb5'); disc(ctx, cx, cy, 13, '#f4f7f8');
    disc(ctx, cx, cy, 12, '#e3efe6');                          // 무채
    for (i = 0; i < 10; i++) {
      a = i * Math.PI / 5;
      hoe(ctx, Math.round(cx + 9 * Math.cos(a)) - 1, Math.round(cy + 9 * Math.sin(a)) - 1, i);
    }
    for (i = 0; i < 5; i++) {
      a = i * Math.PI * 2 / 5 + 0.5;
      hoe(ctx, Math.round(cx + 4 * Math.cos(a)) - 1, Math.round(cy + 4 * Math.sin(a)) - 1, i + 2);
    }
    R(ctx, cx - 1, cy - 1, 3, 3, '#3f9a5a'); R(ctx, cx, cy, 1, 1, '#f6cf4a');   // 깻잎 + 레몬

    // 자리마다 앞접시 + 소주잔
    layout.seats.forEach(function (s, n) {
      var px = Math.round(cx + 39 * Math.cos(s.angle)), py = Math.round(cy + 39 * Math.sin(s.angle));
      smallPlate(ctx, px - 2, py - 1, n);
      var gx = Math.round(cx + 33 * Math.cos(s.angle + 0.2)), gy = Math.round(cy + 33 * Math.sin(s.angle + 0.2));
      sojuGlass(ctx, gx - 1, gy - 1);
    });
    // 소주·맥주 / 매운탕·쌈·초장
    [0.5, 2.1, 3.7, 5.2].forEach(function (ang, n) {
      var bx = Math.round(cx + 25 * Math.cos(ang)), by = Math.round(cy + 25 * Math.sin(ang));
      if (n % 2) beerBottle(ctx, bx - 1, by - 3); else sojuBottle(ctx, bx - 1, by - 3);
    });
    [1.3, 2.9, 4.5, 6.0].forEach(function (ang, n) {
      var bx = Math.round(cx + 26 * Math.cos(ang)), by = Math.round(cy + 26 * Math.sin(ang));
      if (n % 2) ssam(ctx, bx, by); else stew(ctx, bx, by);
    });
    chojang(ctx, cx + 19, cy - 2); chojang(ctx, cx - 22, cy + 1);
  }

  function drawRectTable(ctx, layout) {
    var t = layout.rect, i;
    R(ctx, t.x + 1, t.y + 6, t.w, t.h + 2, 'rgba(20,40,70,0.25)');
    R(ctx, t.x, t.y + t.h, t.w, 4, '#5c3a21');
    R(ctx, t.x, t.y, t.w, t.h, '#8f5d33');
    R(ctx, t.x + 1, t.y + 1, t.w - 2, t.h - 2, '#c08a58');
    for (i = 0; i < 4; i++) {                       // 4인 테이블 4개를 붙인 이음새
      var qx = t.x + i * 56;
      if (i > 0) { R(ctx, qx, t.y, 1, t.h, '#8f5d33'); R(ctx, qx, t.y + t.h, 1, 4, '#3f2613'); }
      R(ctx, qx + 6, t.y + 4, 14, 1, '#d3a06c'); R(ctx, qx + 30, t.y + 30, 18, 1, '#d3a06c');

      // 테이블마다 모둠회 접시 + 술병 + 매운탕/쌈
      var px = qx + 15, py = t.y + 13;
      R(ctx, px, py + 1, 26, 11, '#9fb3c4'); R(ctx, px, py, 26, 11, '#f4f7f8');
      R(ctx, px + 1, py + 1, 24, 9, '#2c6fb5'); R(ctx, px + 2, py + 2, 22, 7, '#e3efe6');
      for (var k = 0; k < 5; k++) { hoe(ctx, px + 3 + k * 4, py + 2, k + i); hoe(ctx, px + 3 + k * 4, py + 6, k + i + 3); }
      R(ctx, px + 12, py + 4, 2, 2, '#3f9a5a'); R(ctx, px + 22, py + 5, 1, 1, '#f6cf4a');
      if (i % 2) beerBottle(ctx, qx + 46, py + 2); else sojuBottle(ctx, qx + 46, py + 2);
      if (i % 2) ssam(ctx, qx + 8, py + 5); else stew(ctx, qx + 8, py + 5);
      chojang(ctx, qx + 50, py + 9);
    }
    // 자리마다 앞접시 + 소주잔
    layout.seats.forEach(function (s, n) {
      if (s.side === 'top') { smallPlate(ctx, s.x - 3, t.y + 3, n); sojuGlass(ctx, s.x + 4, t.y + 4); }
      else if (s.side === 'bottom') { smallPlate(ctx, s.x - 3, t.y + t.h - 6, n); sojuGlass(ctx, s.x + 4, t.y + t.h - 5); }
      else if (s.side === 'left') { smallPlate(ctx, t.x + 2, t.y + 26, n); }
      else { smallPlate(ctx, t.x + t.w - 7, t.y + 26, n); }
    });
  }

  // 입구 간판과 파란 차양 — 캐릭터 위에 덧그려서 문 뒤에서 나오는 것처럼 보이게
  function drawEntrance(ctx, time) {
    R(ctx, 133, 216, 54, 9, NAVY);
    R(ctx, 134, 217, 52, 7, '#2c6fb5');
    for (var i = 0; i < 10; i++) {
      var sway = Math.sin(time * 1.6 + i * 0.9) > 0.7 ? 1 : 0;
      R(ctx, 140 + i * 4, 225, 4, 4 + sway, i % 2 ? '#ffffff' : '#2c6fb5');
    }
    R(ctx, 140, 225, 40, 1, 'rgba(20,40,70,0.25)');
  }

  /* ==========================================================
   * 6. 게임 상태 · 애니메이션 · 화면 출력
   * ========================================================== */
  var PEOPLE = (window.CHARACTERS || []).slice();
  var layouts = { round: buildRoundLayout(), rect: buildRectLayout() };

  var canvas = document.getElementById('game');
  canvas.width = VIEW_W * SS;
  canvas.height = VIEW_H * SS;
  var ctx = canvas.getContext('2d');

  function makeCanvas(w, h) { var c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
  var art = makeCanvas(ART_W, ART_H), artCtx = art.getContext('2d');
  var bg = makeCanvas(ART_W, ART_H), bgCtx = bg.getContext('2d');

  var state = {
    tableType: 'round',
    layout: layouts.round,
    phase: 'ready',        // 'ready' | 'running' | 'done'
    seated: [],            // [{ person, seat, at }]
    walkers: [],           // [{ person, seat, path, seg, x, y, dir, dist }]
    queue: [],             // 입장 대기 [{ person, seat }]
    spawnTimer: 0,
    total: 0,
    time: 0,
    doneAt: 0,
    confetti: [],
    sparkles: []
  };

  function rebuildBackground() {
    drawRoom(bgCtx);
    drawCushions(bgCtx, state.layout);
    state.layout.drawTable(bgCtx, state.layout);
  }

  /** 초기화: 지점장님만 앉아 있는 상태 */
  function reset() {
    state.layout = layouts[state.tableType];
    state.phase = 'ready';
    state.walkers = [];
    state.queue = [];
    state.confetti = [];
    state.sparkles = [];
    state.total = 0;
    // 고정석(지점장님)은 시작 전부터 착석
    state.seated = fixedOnly(PEOPLE, state.layout.seats).map(function (a) {
      return { person: a.person, seat: a.seat, at: -10 };
    });
    rebuildBackground();
    refreshRoster();
    updateUi();
  }

  // 규칙의 고정석만 뽑아내기 (시작 전 화면용)
  function fixedOnly(people, seats) {
    var fixedRules = RULES.filter(function (r) { return r.fixed; });
    var ids = {};
    fixedRules.forEach(function (r) {
      r.fixed({ people: people, seats: seats }).forEach(function (f) { ids[f.person.id] = true; });
    });
    var fixedPeople = people.filter(function (p) { return ids[p.id]; });
    return assignSeats(fixedPeople, seats, fixedRules);
  }

  /** 시작: 섞어서 배정하고 한 명씩 입장 */
  function start() {
    reset();
    var assignment = assignSeats(PEOPLE, state.layout.seats, RULES);
    var seatedIds = {};
    state.seated.forEach(function (s) { seatedIds[s.person.id] = true; });
    state.queue = shuffle(assignment.filter(function (a) { return !seatedIds[a.person.id]; }), Math.random);
    state.total = state.queue.length;
    state.spawnTimer = 0.3;
    state.phase = 'running';
    refreshRoster();
    updateUi();
    if (!state.total) finish();
  }

  function finish() {
    state.phase = 'done';
    state.doneAt = state.time;
    for (var i = 0; i < 140; i++) spawnConfetti(true);
    updateUi();
  }

  var CONFETTI_COLORS = ['#f58b9b', '#ffd27a', '#7fc8f0', '#9ad67a', '#f2b8c6', '#ffffff', '#f6a15a', '#c79af0'];
  function spawnConfetti(initial) {
    state.confetti.push({
      x: Math.random() * VIEW_W,
      y: initial ? -Math.random() * 380 : -12,
      vx: (Math.random() - 0.5) * 50,
      vy: 70 + Math.random() * 110,
      size: 6 + Math.floor(Math.random() * 2) * 3,
      petal: Math.random() < 0.4,
      color: CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)],
      phase: Math.random() * 6.28
    });
  }

  function update(dt) {
    state.time += dt;

    if (state.phase === 'running') {
      // 입장
      state.spawnTimer -= dt;
      if (state.queue.length && state.spawnTimer <= 0) {
        var next = state.queue.shift();
        state.walkers.push({
          person: next.person, seat: next.seat, path: state.layout.pathTo(next.seat),
          seg: 0, x: DOOR.x, y: DOOR.y, dir: 'back', dist: 0
        });
        state.spawnTimer = SPAWN_INTERVAL;
        setRoster(next.person.id, 'walk');
      }
      // 걷기
      for (var i = state.walkers.length - 1; i >= 0; i--) {
        var w = state.walkers[i];
        var remain = WALK_SPEED * dt;
        while (remain > 0 && w.seg < w.path.length) {
          var tx = w.path[w.seg][0], ty = w.path[w.seg][1];
          var dx = tx - w.x, dy = ty - w.y, d = Math.sqrt(dx * dx + dy * dy);
          if (d > 0.01) {
            w.dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'front' : 'back');
          }
          if (d <= remain) { w.x = tx; w.y = ty; w.seg++; remain -= d; w.dist += d; }
          else { w.x += dx / d * remain; w.y += dy / d * remain; w.dist += remain; remain = 0; }
        }
        if (w.seg >= w.path.length) {       // 도착 → 착석
          state.walkers.splice(i, 1);
          state.seated.push({ person: w.person, seat: w.seat, at: state.time });
          setRoster(w.person.id, 'done');
          updateUi();
        }
      }
      if (!state.queue.length && !state.walkers.length) finish();
    }

    if (state.phase === 'done') {
      var since = state.time - state.doneAt;
      if (since < 6 && Math.random() < dt * 45) spawnConfetti(false);
      if (since < 8 && Math.random() < dt * 14) {
        state.sparkles.push({ x: 60 + Math.random() * (VIEW_W - 120), y: 110 + Math.random() * 540, t: 0, life: 0.5 + Math.random() * 0.5 });
      }
    }
    state.confetti = state.confetti.filter(function (p) {
      p.x += (p.vx + Math.sin(state.time * 3 + p.phase) * 40) * dt;
      p.y += p.vy * dt;
      return p.y < VIEW_H + 20;
    });
    state.sparkles = state.sparkles.filter(function (s) { s.t += dt; return s.t < s.life; });
  }

  var WALK_FRAMES = [1, 0, 2, 0];

  function drawLabel(text, cx, cy, isManager, maxW) {
    var size = 12, tw;
    do {
      ctx.font = 'bold ' + size + 'px ' + FONT;
      tw = ctx.measureText(text).width;
      size--;
    } while (tw + 10 > maxW && size >= 9);
    var w = Math.ceil(tw) + 10, h = 18;
    var x = Math.round(cx - w / 2), y = Math.round(cy - h / 2);
    ctx.fillStyle = isManager ? '#a8741a' : '#1f3f6e';
    ctx.fillRect(x, y + 2, w, h - 4); ctx.fillRect(x + 2, y, w - 4, h);
    ctx.fillStyle = isManager ? '#ffe08a' : '#ffffff';
    ctx.fillRect(x + 2, y + 2, w - 4, h - 4);
    ctx.fillStyle = '#1b2f4f';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(text, cx, cy + 1);
  }

  function nameOf(p) { return (p.rank ? p.rank + ' ' : '') + p.name; }

  /** 화면 그리기. clean=true 이면 저장용(꽃가루 없이, 흔들림 없이) */
  function render(clean) {
    var t = state.time, done = state.phase === 'done';
    var a = artCtx;
    a.drawImage(bg, 0, 0);

    // 수족관 물고기 등 움직이는 배경
    drawAmbient(a, clean ? 0 : t);

    // 캐릭터 (아래쪽에 있는 사람이 위에 그려지도록 y 정렬)
    var items = [];
    state.seated.forEach(function (s) {
      var base = s.seat.y + 8, hop = 0;
      var since = t - s.at;
      if (!clean) {
        if (since < 0.3) hop = -Math.round(Math.sin(Math.PI * since / 0.3) * 3);
        else if (done && Math.sin(t * 7 + s.seat.id * 1.7) > 0.5) hop = -1;
      }
      items.push({ y: base, draw: function () {
        drawCharacter(a, s.person, s.seat.x - 8, base - 17 + hop, { sit: true, dir: done ? 'front' : s.seat.facing });
      } });
    });
    state.walkers.forEach(function (w) {
      var x = Math.round(w.x), y = Math.round(w.y);
      items.push({ y: y, draw: function () {
        drawCharacter(a, w.person, x - 8, y - 20, { dir: w.dir, frame: WALK_FRAMES[Math.floor(w.dist / 4) % 4] });
      } });
    });
    items.sort(function (p, q) { return p.y - q.y; });
    items.forEach(function (it) { it.draw(); });

    drawEntrance(a, clean ? 0 : t);

    // 확대해서 본 화면에 출력
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(art, 0, 0, canvas.width, canvas.height);
    ctx.setTransform(SS, 0, 0, SS, 0, 0);
    drawSigns(ctx, done);

    // 이름표 ("직급 이름")
    var layout = state.layout;
    state.seated.forEach(function (s) {
      var text = nameOf(s.person);
      ctx.font = 'bold 12px ' + FONT;
      var w = Math.min(ctx.measureText(text).width + 10, layout.labelMaxW);
      var pos = layout.labelPos(s.seat, w);
      drawLabel(text, Math.round(pos.x), Math.round(pos.y), s.person.isManager, pos.maxW || layout.labelMaxW);
    });

    if (done) {
      // 완료 현수막
      var bw = 430, bh = 46, bx = (VIEW_W - bw) / 2, by = 22;
      ctx.fillStyle = '#1f3f6e'; ctx.fillRect(bx, by + 3, bw, bh - 6); ctx.fillRect(bx + 3, by, bw - 6, bh);
      ctx.fillStyle = '#ffffff'; ctx.fillRect(bx + 3, by + 3, bw - 6, bh - 6);
      ctx.fillStyle = '#d9463e'; ctx.fillRect(bx + 8, by + 8, 6, bh - 16); ctx.fillRect(bx + bw - 14, by + 8, 6, bh - 16);
      ctx.fillStyle = '#1b2f4f';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.font = 'bold 20px ' + FONT;
      ctx.fillText('자리 배치 완료!  즐거운 회식 되세요', VIEW_W / 2, by + bh / 2 + 1);

      if (!clean) {
        state.sparkles.forEach(function (s) {
          var k = Math.sin(Math.PI * s.t / s.life), r = Math.round(3 + 6 * k);
          ctx.globalAlpha = 0.5 + 0.5 * k;
          ctx.fillStyle = '#fff6c0';
          ctx.fillRect(s.x - 1.5, s.y - r, 3, r * 2); ctx.fillRect(s.x - r, s.y - 1.5, r * 2, 3);
          ctx.fillStyle = '#ffffff'; ctx.fillRect(s.x - 1.5, s.y - 1.5, 3, 3);
        });
        ctx.globalAlpha = 1;
        state.confetti.forEach(function (p) {
          ctx.fillStyle = p.petal ? '#f7b6c8' : p.color;
          var flip = Math.sin(state.time * 6 + p.phase) > 0;
          if (p.petal) { ctx.fillRect(Math.round(p.x), Math.round(p.y), 9, 6); ctx.fillStyle = '#fbd9e2'; ctx.fillRect(Math.round(p.x) + 3, Math.round(p.y), 3, 3); }
          else ctx.fillRect(Math.round(p.x), Math.round(p.y), flip ? p.size : 3, flip ? 3 : p.size);
        });
      }
    }
  }

  var lastTs = 0;
  function loop(ts) {
    var dt = Math.min(0.05, (ts - lastTs) / 1000 || 0);
    lastTs = ts;
    update(dt);
    render(false);
    requestAnimationFrame(loop);
  }

  /* ==========================================================
   * 7. 버튼 · 참석자 목록 · PNG 저장
   * ========================================================== */
  var el = {
    roster: document.getElementById('roster'),
    count: document.getElementById('count'),
    status: document.getElementById('status'),
    round: document.getElementById('btnRound'),
    rect: document.getElementById('btnRect'),
    start: document.getElementById('btnStart'),
    retry: document.getElementById('btnRetry'),
    save: document.getElementById('btnSave')
  };
  var rosterItems = {};
  var BADGE = { wait: '대기 중', walk: '입장 중', done: '착석 완료', fixed: '고정석 ★' };

  function buildRoster() {
    el.count.textContent = '(' + PEOPLE.length + '명)';
    PEOPLE.forEach(function (p) {
      var li = document.createElement('li');
      var cv = makeCanvas(16, 17);                 // 얼굴 위주로 잘라서 표시
      drawCharacter(cv.getContext('2d'), p, 0, 4, { dir: 'front' });
      var name = document.createElement('span'); name.className = 'name'; name.textContent = nameOf(p);
      var badge = document.createElement('span'); badge.className = 'badge';
      li.appendChild(cv); li.appendChild(name); li.appendChild(badge);
      el.roster.appendChild(li);
      rosterItems[p.id] = { li: li, badge: badge };
    });
  }
  function setRoster(id, st) {
    var it = rosterItems[id];
    if (!it) return;
    it.li.className = st;
    it.badge.textContent = BADGE[st];
  }
  function refreshRoster() {
    var fixedIds = {};
    state.seated.forEach(function (s) { fixedIds[s.person.id] = true; });
    PEOPLE.forEach(function (p) { setRoster(p.id, fixedIds[p.id] ? 'fixed' : 'wait'); });
  }

  function updateUi() {
    var ph = state.phase;
    el.round.setAttribute('aria-pressed', String(state.tableType === 'round'));
    el.rect.setAttribute('aria-pressed', String(state.tableType === 'rect'));
    el.start.disabled = ph !== 'ready';
    el.retry.disabled = ph === 'ready';
    el.save.disabled = ph !== 'done';
    var arrived = state.total - state.queue.length - state.walkers.length;
    el.status.textContent =
      ph === 'ready' ? '[시작]을 누르면 직원들이 한 명씩 입장합니다.' :
      ph === 'running' ? '입장 중…  ' + arrived + ' / ' + state.total + '명 착석' :
      '모두 착석 완료!  [결과 PNG 저장]으로 자리표를 저장할 수 있어요.';
  }

  function setTable(type) {
    if (state.tableType === type && state.phase === 'ready') return;
    state.tableType = type;
    reset();
  }

  function savePng() {
    if (state.phase !== 'done') return;
    render(true);                                   // 꽃가루 없는 깔끔한 자리표
    var d = new Date();
    function z(n) { return (n < 10 ? '0' : '') + n; }
    // 일부 브라우저는 한글 파일 이름을 무시하므로 영문 이름으로 저장합니다
    var name = 'seating_' + state.tableType + '_' +
      d.getFullYear() + z(d.getMonth() + 1) + z(d.getDate()) + '_' + z(d.getHours()) + z(d.getMinutes()) + '.png';
    function download(url, revoke) {
      var a = document.createElement('a');
      a.href = url; a.download = name;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      if (revoke) setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
    }
    // file:// 로 열었을 때도 파일 이름이 유지되도록 data URL 로 저장
    download(canvas.toDataURL('image/png'), false);
  }

  el.round.addEventListener('click', function () { setTable('round'); });
  el.rect.addEventListener('click', function () { setTable('rect'); });
  el.start.addEventListener('click', start);
  el.retry.addEventListener('click', start);
  el.save.addEventListener('click', savePng);

  buildRoster();
  reset();
  requestAnimationFrame(loop);

  // 콘솔에서 확인/테스트할 수 있도록 공개
  window.SeatGame = { assignSeats: assignSeats, RULES: RULES, state: state, layouts: layouts };
})();
