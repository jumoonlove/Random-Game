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
  var SPAWN_INTERVAL = 0.6;        // 다음 사람이 입장하기까지 간격(초)

  var FONT = '"Malgun Gothic","맑은 고딕","Apple SD Gothic Neo","Noto Sans KR",sans-serif';

  var SKIN_TONES = { light: '#ffe0c4', fair: '#f6cfa6', tan: '#dfa878', dark: '#a87550' };
  var HAIR_COLORS = {
    black: '#2b2326', darkbrown: '#4a3226', brown: '#7a4e2d', lightbrown: '#a8733f',
    gray: '#9a9aa6', blonde: '#e0b85a', red: '#b5452f'
  };

  var DOOR = { x: 160, y: 252 };   // 노렌(입구) 바깥 시작 위치

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
   *   seat       = { id, x, y, isManagerSeat, adjacent: [옆자리 좌석 id] }
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
  var RULES = [
    managerFixedRule
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
    var MAX_TRIES = 1000;

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
      if (ok) return result;
    }
    console.warn('규칙을 모두 만족하는 배치를 찾지 못해 마지막 배치를 사용합니다.');
    return result;
  }

  /* ==========================================================
   * 3. 픽셀 캐릭터 그리기
   * ----------------------------------------------------------
   * 16 x 20 칸 기준. (ox, oy) 는 왼쪽 위.
   * opts: { dir: 'front'|'back'|'left'|'right', frame: 0|1|2, sit: bool }
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
    var out = 'rgb(' + A.map(function (v, i) { return Math.round(v + (B[i] - v) * t); }).join(',') + ')';
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

    var skin = SKIN_TONES[c.skinTone] || c.skinTone || SKIN_TONES.fair;
    var hair = HAIR_COLORS[c.hairColor] || c.hairColor || HAIR_COLORS.black;
    var cloth = c.clothColor || '#5a8fd0';
    var clothD = mix(cloth, '#000000', 0.22);
    var hairL = mix(hair, '#ffffff', 0.25);
    var hairD = mix(hair, '#000000', 0.25);
    var blush = mix(skin, '#e8605a', 0.38);
    var mouth = mix(skin, '#6b1f1f', 0.55);
    var EYE = '#2b2030', PANTS = '#3b3f5c', SHOE = '#2a2230', FRAME = '#59607a';
    var female = c.gender === 'F';
    var style = c.hairStyle || 'short';

    function P(x, y, w, h, col) {
      ctx.fillStyle = col;
      ctx.fillRect(ox + (mirror ? 16 - x - w : x), oy + y, w, h);
    }

    // 그림자
    if (!sit) P(3, 19, 10, 2, 'rgba(60,30,10,0.22)');

    /* ---------- 뒤로 넘어가는 긴 머리 (몸보다 먼저) ---------- */
    if (dir === 'front') {
      if (style === 'long') { P(2, 3, 2, 13, hairD); P(12, 3, 2, 13, hairD); }
      if (style === 'bob') { P(2, 3, 2, 8, hairD); P(12, 3, 2, 8, hairD); }
      if (style === 'ponytail') { P(13, 3, 2, 3, hair); P(14, 6, 1, 5, hairD); }
    }

    /* ---------- 다리 ---------- */
    if (!sit) {
      if (side) {
        if (frame === 0) {
          P(6, 17, 3, 2, female ? skin : PANTS);
          P(6, 19, 4, 1, SHOE);
        } else {
          P(5, 17, 2, 2, female ? skin : PANTS);
          P(9, 17, 2, 2, female ? skin : PANTS);
          P(5, 19, 2, 1, SHOE);
          P(9, 19, 3, 1, SHOE);
        }
      } else {
        var legCol = female ? skin : PANTS;
        // frame 1: 왼발 들기, frame 2: 오른발 들기
        if (frame === 1) { P(5, 17, 2, 1, legCol); P(5, 18, 2, 1, SHOE); }
        else { P(5, 17, 2, 2, legCol); P(5, 19, 2, 1, SHOE); }
        if (frame === 2) { P(9, 17, 2, 1, legCol); P(9, 18, 2, 1, SHOE); }
        else { P(9, 17, 2, 2, legCol); P(9, 19, 2, 1, SHOE); }
      }
    }

    /* ---------- 몸통 ---------- */
    if (side) {
      P(5, 11, 6, 6, cloth);
      if (female) P(5, 16, 6, sit ? 1 : 2, clothD);
      P(7, 11, 2, 4, clothD);          // 팔
      P(7, 15, 2, 1, skin);            // 손
    } else {
      P(4, 11, 8, 6, cloth);
      if (female) P(4, 16, 8, sit ? 1 : 2, clothD);
      P(3, 11, 1, 4, clothD); P(12, 11, 1, 4, clothD);   // 팔
      P(3, 15, 1, 1, skin); P(12, 15, 1, 1, skin);       // 손
      if (dir === 'front') {
        P(7, 11, 2, 1, '#fff8ee');                       // 옷깃
        if (c.isManager) { P(7, 12, 2, 3, '#c9363a'); P(6, 11, 1, 2, '#fff8ee'); P(9, 11, 1, 2, '#fff8ee'); }
        else if (!female) P(7, 12, 1, 3, clothD);
      }
    }

    /* ---------- 머리(얼굴) ---------- */
    P(4, 2, 8, 9, skin);
    P(3, 3, 10, 7, skin);

    if (dir === 'front') {
      P(5, 6, 1, 2, EYE); P(10, 6, 1, 2, EYE);
      P(4, 8, 1, 1, blush); P(11, 8, 1, 1, blush);
      P(7, 9, 2, 1, mouth);
      if (c.glasses) {
        P(4, 5, 3, 1, FRAME); P(4, 8, 3, 1, FRAME); P(4, 6, 1, 2, FRAME); P(6, 6, 1, 2, FRAME);
        P(9, 5, 3, 1, FRAME); P(9, 8, 3, 1, FRAME); P(9, 6, 1, 2, FRAME); P(11, 6, 1, 2, FRAME);
        P(7, 6, 2, 1, FRAME);
      }
    } else if (side) {
      P(10, 6, 1, 2, EYE);
      P(10, 8, 1, 1, blush);
      P(11, 9, 1, 1, mouth);
      if (c.glasses) {
        P(9, 5, 3, 1, FRAME); P(9, 8, 3, 1, FRAME); P(9, 6, 1, 2, FRAME); P(11, 6, 1, 2, FRAME);
        P(6, 6, 3, 1, FRAME);
      }
    }

    /* ---------- 머리카락 ---------- */
    var cap = style !== 'bald';
    if (dir === 'front') {
      if (cap) {
        P(4, 1, 8, 1, hair); P(3, 2, 10, 2, hair);
        P(3, 4, 1, 2, hair); P(12, 4, 1, 2, hair);
        P(5, 2, 2, 1, hairL);
      } else {
        P(3, 4, 1, 3, hair); P(12, 4, 1, 3, hair);
        P(6, 3, 2, 1, mix(skin, '#ffffff', 0.5));
      }
      if (style === 'part') { P(3, 4, 4, 1, hair); P(8, 4, 5, 1, hair); }
      if (style === 'bangs' || style === 'bob' || style === 'long') { P(3, 4, 10, 1, hair); P(3, 5, 1, 1, hair); P(12, 5, 1, 1, hair); }
      if (style === 'ponytail') { P(4, 4, 2, 1, hair); P(10, 4, 2, 1, hair); P(13, 3, 1, 1, '#d9463e'); }
      if (style === 'bun') { P(6, -1, 4, 2, hair); P(7, -1, 1, 1, hairL); P(4, 4, 3, 1, hair); P(9, 4, 3, 1, hair); }
      if (style === 'curly') {
        P(2, 1, 12, 3, hair); P(4, 0, 2, 1, hair); P(7, 0, 2, 1, hair); P(10, 0, 2, 1, hair);
        P(2, 4, 2, 3, hair); P(12, 4, 2, 3, hair); P(5, 4, 1, 1, hair); P(8, 4, 1, 1, hair); P(10, 4, 1, 1, hair);
        P(5, 1, 2, 1, hairL);
      }
      if (style === 'spiky') { P(4, 0, 1, 1, hair); P(6, 0, 2, 1, hair); P(9, 0, 1, 1, hair); P(11, 0, 1, 1, hair); P(5, 4, 1, 1, hair); P(8, 4, 2, 1, hair); }
    } else if (dir === 'back') {
      if (cap) {
        P(4, 1, 8, 1, hair); P(3, 2, 10, 7, hair); P(4, 9, 8, 1, hair);
        P(5, 2, 2, 1, hairL);
      } else {
        P(3, 5, 10, 3, hair);
      }
      if (style === 'bob') P(2, 3, 12, 8, hair);
      if (style === 'long') { P(2, 3, 12, 12, hair); P(3, 15, 10, 1, hairD); }
      if (style === 'ponytail') { P(7, 3, 2, 1, '#d9463e'); P(7, 4, 2, 9, hairD); }
      if (style === 'bun') { P(6, -1, 4, 2, hair); }
      if (style === 'curly') { P(2, 1, 12, 8, hair); P(4, 0, 2, 1, hair); P(7, 0, 2, 1, hair); P(10, 0, 2, 1, hair); }
      if (style === 'spiky') { P(4, 0, 1, 1, hair); P(6, 0, 2, 1, hair); P(9, 0, 1, 1, hair); P(11, 0, 1, 1, hair); }
    } else {
      // 옆모습 (오른쪽을 보는 기준, 왼쪽은 좌우 반전)
      if (cap) {
        P(4, 1, 8, 1, hair); P(3, 2, 10, 2, hair);
        P(3, 4, 5, 5, hair); P(4, 9, 3, 1, hair);
        P(6, 2, 2, 1, hairL);
      } else {
        P(3, 5, 4, 3, hair);
      }
      if (style === 'part' || style === 'bangs' || style === 'bob' || style === 'long') P(8, 4, 4, 1, hair);
      if (style === 'bob') P(2, 3, 5, 8, hair);
      if (style === 'long') { P(2, 3, 4, 13, hair); }
      if (style === 'ponytail') { P(2, 3, 1, 1, '#d9463e'); P(1, 4, 2, 7, hairD); }
      if (style === 'bun') P(4, -1, 4, 2, hair);
      if (style === 'curly') { P(2, 1, 12, 3, hair); P(2, 4, 6, 6, hair); P(4, 0, 2, 1, hair); P(7, 0, 2, 1, hair); P(10, 0, 2, 1, hair); }
      if (style === 'spiky') { P(4, 0, 1, 1, hair); P(6, 0, 2, 1, hair); P(9, 0, 1, 1, hair); P(11, 0, 1, 1, hair); }
    }

    /* ---------- 지점장님 왕관 ---------- */
    if (c.isManager) {
      var G = '#f5c542', GD = '#c9952a';
      P(5, -2, 6, 2, G); P(5, -1, 6, 1, GD);
      P(5, -3, 1, 1, G); P(7, -3, 2, 1, G); P(10, -3, 1, 1, G);
      P(7, -2, 2, 1, '#d9463e');
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
      s.facing = { top: 'front', bottom: 'back', left: 'right', right: 'left' }[s.side];
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
   * 5. 배경 / 테이블 / 소품
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

  var LANTERNS = [{ x: 62, y: 14 }, { x: 258, y: 14 }];
  var ANDONS = [{ x: 11, y: 58 }, { x: 308, y: 58 }, { x: 11, y: 150 }, { x: 308, y: 150 }];

  function drawRoom(ctx) {
    var rnd = seededRandom(7), x, y, i;

    /* 나무 바닥 */
    R(ctx, 0, 32, ART_W, ART_H - 32, '#c99a63');
    for (y = 32, i = 0; y < ART_H; y += 8, i++) {
      R(ctx, 0, y, ART_W, 1, '#b3824f');
      for (x = (i % 2) * 22 + 6; x < ART_W; x += 44) R(ctx, x, y + 1, 1, 7, '#b3824f');
      for (var k = 0; k < 5; k++) R(ctx, Math.floor(rnd() * ART_W), y + 2 + Math.floor(rnd() * 5), 3, 1, '#d6aa74');
    }

    /* 다다미 (4 x 4 장) */
    var tx = 24, ty = 44, mw = 68, mh = 44;
    R(ctx, tx - 2, ty - 2, mw * 4 + 4, mh * 4 + 4, '#4f6038');
    for (var r = 0; r < 4; r++) {
      for (var c = 0; c < 4; c++) {
        var mx = tx + c * mw, my = ty + r * mh, alt = (r + c) % 2;
        R(ctx, mx, my, mw, mh, '#5f7446');
        R(ctx, mx + 1, my + 1, mw - 2, mh - 2, alt ? '#cdd391' : '#d6db9c');
        if (alt) for (x = mx + 3; x < mx + mw - 2; x += 3) R(ctx, x, my + 1, 1, mh - 2, '#c2c984');
        else for (y = my + 3; y < my + mh - 2; y += 3) R(ctx, mx + 1, y, mw - 2, 1, '#cbd18e');
      }
    }

    /* 뒷벽 (장지문) */
    R(ctx, 0, 0, ART_W, 32, '#f3e8cb');
    for (x = 0; x < ART_W; x += 8) R(ctx, x, 5, 1, 23, '#e2d0a6');
    R(ctx, 0, 12, ART_W, 1, '#d3b98a'); R(ctx, 0, 20, ART_W, 1, '#d3b98a');
    for (x = 0; x < ART_W; x += 40) R(ctx, x - 1, 4, 2, 24, '#8a5a36');
    R(ctx, ART_W - 1, 4, 1, 24, '#8a5a36');
    R(ctx, 0, 0, ART_W, 4, '#6b4428'); R(ctx, 0, 4, ART_W, 1, '#55341d');
    R(ctx, 0, 28, ART_W, 4, '#7a4d2c'); R(ctx, 0, 31, ART_W, 1, '#55341d');
    R(ctx, 0, 32, ART_W, 2, 'rgba(60,30,10,0.18)');

    /* 족자 */
    R(ctx, 151, 6, 18, 21, '#faf6ea');
    R(ctx, 151, 6, 18, 2, '#8c3b3b'); R(ctx, 151, 25, 18, 2, '#8c3b3b');
    R(ctx, 149, 5, 22, 1, '#55341d'); R(ctx, 149, 27, 22, 1, '#55341d');
    disc(ctx, 160, 13, 3, '#d9463e');
    R(ctx, 153, 21, 3, 1, '#2f4a7a'); R(ctx, 156, 20, 3, 1, '#2f4a7a');
    R(ctx, 159, 21, 3, 1, '#2f4a7a'); R(ctx, 162, 20, 3, 1, '#2f4a7a'); R(ctx, 165, 21, 2, 1, '#2f4a7a');

    /* 나무 메뉴판 */
    [98, 107, 116, 198, 207, 216].forEach(function (px, n) {
      R(ctx, px, 8, 7, 17, '#e6cf9c'); R(ctx, px, 8, 7, 1, '#b98d62'); R(ctx, px, 24, 7, 1, '#b98d62');
      for (var q = 0; q < 4; q++) R(ctx, px + 2 + ((q + n) % 2), 11 + q * 3, 2 + ((q + n) % 2), 1, '#4a2e1a');
    });

    /* 매달린 붉은 등 */
    LANTERNS.forEach(function (l) {
      R(ctx, l.x, 4, 1, 4, '#3a2a2a');
      ellipse(ctx, l.x, l.y + 1, 6, 6, '#e2503f');
      R(ctx, l.x - 5, l.y - 2, 11, 1, '#c53d30'); R(ctx, l.x - 6, l.y + 1, 13, 1, '#c53d30'); R(ctx, l.x - 5, l.y + 4, 11, 1, '#c53d30');
      R(ctx, l.x - 1, l.y - 2, 3, 7, '#ffb96a'); R(ctx, l.x, l.y - 1, 1, 5, '#ffe9a8');
      R(ctx, l.x - 3, l.y - 6, 7, 1, '#3a2a2a'); R(ctx, l.x - 3, l.y + 8, 7, 1, '#3a2a2a');
      R(ctx, l.x, l.y + 9, 1, 3, '#d9a93a');
    });

    /* 바닥 등불 (안돈) */
    ANDONS.forEach(function (a) {
      R(ctx, a.x - 4, a.y + 7, 9, 2, 'rgba(60,30,10,0.22)');
      R(ctx, a.x - 4, a.y - 7, 9, 14, '#4a2e1a');
      R(ctx, a.x - 3, a.y - 6, 7, 12, '#ffe9a8');
      R(ctx, a.x, a.y - 6, 1, 12, '#4a2e1a'); R(ctx, a.x - 3, a.y, 7, 1, '#4a2e1a');
      R(ctx, a.x - 2, a.y - 5, 2, 4, '#fff6d0');
      R(ctx, a.x - 4, a.y + 7, 2, 1, '#4a2e1a'); R(ctx, a.x + 3, a.y + 7, 2, 1, '#4a2e1a');
    });

    /* 입구 쪽 벽과 문 */
    R(ctx, 0, 228, ART_W, 12, '#6b4428'); R(ctx, 0, 228, ART_W, 2, '#8a5a36');
    for (x = 10; x < ART_W; x += 20) R(ctx, x, 230, 1, 10, '#55341d');
    R(ctx, 140, 226, 40, 14, '#b98d62'); R(ctx, 142, 232, 36, 8, '#8f6a45');
    R(ctx, 138, 222, 2, 18, '#4a2e1a'); R(ctx, 180, 222, 2, 18, '#4a2e1a');

    /* 화분 */
    [[10, 208], [309, 208]].forEach(function (p) {
      R(ctx, p[0] - 5, p[1] + 9, 11, 2, 'rgba(60,30,10,0.22)');
      disc(ctx, p[0] - 3, p[1] - 4, 4, '#4f8a4c'); disc(ctx, p[0] + 3, p[1] - 5, 4, '#5fa05a'); disc(ctx, p[0], p[1] - 9, 4, '#6fb56a');
      R(ctx, p[0] - 1, p[1] - 3, 2, 5, '#3f6e3c');
      R(ctx, p[0] - 4, p[1] + 1, 9, 2, '#a85f3f'); R(ctx, p[0] - 3, p[1] + 3, 7, 6, '#8a4b32');
    });
  }

  // 초밥 한 점 (3 x 3)
  var TOPPINGS = ['#f58b5b', '#d8414a', '#f6cf4a', '#f7b79a', '#f58b5b', '#e86f8a'];
  function nigiri(ctx, x, y, kind) {
    var col = TOPPINGS[kind % TOPPINGS.length];
    R(ctx, x, y + 1, 3, 2, '#fbf7ee');
    R(ctx, x, y, 3, 2, col);
    if (col === '#f6cf4a') R(ctx, x + 1, y, 1, 3, '#22303a');           // 계란 + 김 띠
    else R(ctx, x + 1, y, 1, 1, mix(col, '#ffffff', 0.45));
  }
  function maki(ctx, x, y) {
    R(ctx, x, y, 3, 3, '#22303a'); R(ctx, x + 1, y + 1, 1, 1, '#f58b5b');
    R(ctx, x + 1, y, 1, 1, '#fbf7ee'); R(ctx, x, y + 1, 1, 1, '#fbf7ee'); R(ctx, x + 2, y + 1, 1, 1, '#fbf7ee'); R(ctx, x + 1, y + 2, 1, 1, '#fbf7ee');
  }
  // 사케병(도쿠리)
  function sakeBottle(ctx, x, y) {
    R(ctx, x, y + 6, 4, 1, 'rgba(60,30,10,0.25)');
    R(ctx, x + 1, y - 2, 1, 2, '#e8eef2'); R(ctx, x, y - 3, 3, 1, '#f6fafc');
    R(ctx, x, y, 3, 6, '#e8eef2'); R(ctx, x, y + 2, 3, 2, '#3d6fb0'); R(ctx, x, y, 1, 6, '#f6fafc');
  }
  function beerBottle(ctx, x, y) {
    R(ctx, x, y + 6, 4, 1, 'rgba(60,30,10,0.25)');
    R(ctx, x + 1, y - 3, 1, 3, '#7a4a22'); R(ctx, x, y, 3, 6, '#7a4a22'); R(ctx, x, y + 2, 3, 2, '#f1e2a8'); R(ctx, x + 1, y - 4, 1, 1, '#d9a93a');
  }
  function sakeCup(ctx, x, y) { R(ctx, x, y, 2, 2, '#f6fafc'); R(ctx, x, y + 1, 2, 1, '#c9d6de'); }
  function teaCup(ctx, x, y) { R(ctx, x, y, 3, 3, '#5b7f8a'); R(ctx, x, y, 3, 1, '#9ac27a'); }
  function smallPlate(ctx, x, y, kind) {
    R(ctx, x, y, 5, 3, '#f4f1e8'); R(ctx, x, y + 2, 5, 1, '#d6d0c0');
    R(ctx, x + 1, y, 3, 2, TOPPINGS[kind % TOPPINGS.length]); R(ctx, x + 1, y + 1, 3, 1, '#fbf7ee');
  }
  function soyDish(ctx, x, y) { R(ctx, x, y, 3, 2, '#f4f1e8'); R(ctx, x + 1, y, 1, 1, '#3a2218'); }

  function drawCushions(ctx, layout) {
    layout.seats.forEach(function (s, i) {
      var col = s.isManagerSeat ? '#e0a92e' : (i % 2 ? '#b5485a' : '#4a6fa5');
      var by = s.y + 8;
      ellipse(ctx, s.x, by + 1, 9, 4, 'rgba(60,30,10,0.2)');
      ellipse(ctx, s.x, by, 9, 4, mix(col, '#000000', 0.25));
      ellipse(ctx, s.x, by - 1, 8, 3, col);
      if (s.isManagerSeat) { R(ctx, s.x - 9, by + 4, 2, 2, '#c9363a'); R(ctx, s.x + 8, by + 4, 2, 2, '#c9363a'); }
    });
  }

  function drawRoundTable(ctx, layout) {
    var cx = 160, cy = 126, r = 48, i, a;
    ellipse(ctx, cx, cy + 7, r + 1, r, 'rgba(60,30,10,0.25)');
    disc(ctx, cx, cy + 4, r, '#5c3a21');
    disc(ctx, cx, cy, r, '#8f5d33');
    disc(ctx, cx, cy, r - 2, '#bb8250');
    disc(ctx, cx, cy, r - 14, '#c38a57');
    disc(ctx, cx, cy, r - 15, '#bb8250');
    R(ctx, cx - 30, cy - 34, 12, 1, '#cf9a68'); R(ctx, cx - 36, cy - 28, 6, 1, '#cf9a68');

    // 가운데 큰 초밥 접시
    disc(ctx, cx, cy + 1, 15, '#1f2228');
    disc(ctx, cx, cy, 15, '#2e3440');
    disc(ctx, cx, cy, 13, '#b3262b');
    disc(ctx, cx, cy, 12, '#c9363a');
    for (i = 0; i < 8; i++) {
      a = i * Math.PI / 4;
      nigiri(ctx, Math.round(cx + 8 * Math.cos(a)) - 1, Math.round(cy + 8 * Math.sin(a)) - 1, i);
    }
    maki(ctx, cx - 3, cy - 1); maki(ctx, cx + 1, cy - 1);
    R(ctx, cx - 1, cy + 3, 3, 2, '#7fae6a');   // 와사비

    // 자리마다 앞접시 + 잔
    layout.seats.forEach(function (s, n) {
      var px = Math.round(cx + 39 * Math.cos(s.angle)), py = Math.round(cy + 39 * Math.sin(s.angle));
      smallPlate(ctx, px - 2, py - 1, n);
      var tx = Math.round(cx + 33 * Math.cos(s.angle + 0.2)), tyy = Math.round(cy + 33 * Math.sin(s.angle + 0.2));
      sakeCup(ctx, tx - 1, tyy - 1);
    });
    // 술병 / 찻잔 / 간장
    [0.5, 2.1, 3.7, 5.2].forEach(function (ang, n) {
      var bx = Math.round(cx + 23 * Math.cos(ang)), by = Math.round(cy + 23 * Math.sin(ang));
      if (n % 2) beerBottle(ctx, bx - 1, by - 3); else sakeBottle(ctx, bx - 1, by - 3);
    });
    [1.3, 2.9, 4.5, 6.0].forEach(function (ang, n) {
      var bx = Math.round(cx + 24 * Math.cos(ang)), by = Math.round(cy + 24 * Math.sin(ang));
      if (n % 2) teaCup(ctx, bx - 1, by - 1); else soyDish(ctx, bx - 1, by - 1);
    });
  }

  function drawRectTable(ctx, layout) {
    var t = layout.rect, i;
    R(ctx, t.x + 1, t.y + 6, t.w, t.h + 2, 'rgba(60,30,10,0.25)');
    R(ctx, t.x, t.y + t.h, t.w, 4, '#5c3a21');
    R(ctx, t.x, t.y, t.w, t.h, '#8f5d33');
    R(ctx, t.x + 1, t.y + 1, t.w - 2, t.h - 2, '#bb8250');
    for (i = 0; i < 4; i++) {                       // 4인 테이블 4개를 붙인 이음새
      var qx = t.x + i * 56;
      if (i > 0) { R(ctx, qx, t.y, 1, t.h, '#8f5d33'); R(ctx, qx, t.y + t.h, 1, 4, '#3f2613'); }
      R(ctx, qx + 6, t.y + 4, 14, 1, '#c99462'); R(ctx, qx + 30, t.y + 30, 18, 1, '#c99462');

      // 테이블마다 초밥 접시 + 술병
      var px = qx + 16, py = t.y + 14;
      R(ctx, px, py + 1, 24, 9, '#1f2228'); R(ctx, px, py, 24, 9, '#2e3440'); R(ctx, px + 1, py + 1, 22, 7, '#3b4252');
      for (var k = 0; k < 5; k++) nigiri(ctx, px + 2 + k * 4, py + 1, k + i);
      maki(ctx, px + 2, py + 5); maki(ctx, px + 6, py + 5); maki(ctx, px + 10, py + 5);
      R(ctx, px + 15, py + 5, 3, 2, '#7fae6a'); R(ctx, px + 19, py + 5, 3, 2, '#f2b8c6');
      if (i % 2) beerBottle(ctx, qx + 46, py + 1); else sakeBottle(ctx, qx + 46, py + 1);
      if (i % 2) soyDish(ctx, qx + 8, py + 4); else teaCup(ctx, qx + 8, py + 3);
    }
    // 자리마다 앞접시 + 잔
    layout.seats.forEach(function (s, n) {
      if (s.side === 'top') { smallPlate(ctx, s.x - 3, t.y + 3, n); sakeCup(ctx, s.x + 4, t.y + 4); }
      else if (s.side === 'bottom') { smallPlate(ctx, s.x - 3, t.y + t.h - 6, n); sakeCup(ctx, s.x + 4, t.y + t.h - 5); }
      else if (s.side === 'left') { smallPlate(ctx, t.x + 2, t.y + 20, n); }
      else { smallPlate(ctx, t.x + t.w - 7, t.y + 20, n); }
    });
  }

  // 노렌(입구 천막) — 캐릭터 위에 덧그려서 뒤에서 나오는 것처럼 보이게
  function drawNoren(ctx, time) {
    R(ctx, 136, 221, 48, 2, '#4a2e1a');
    for (var i = 0; i < 4; i++) {
      var sway = Math.sin(time * 1.6 + i * 1.3) > 0.6 ? 1 : 0;
      var x = 140 + i * 10, h = 11 + sway;
      R(ctx, x, 223, 10, h, '#2f4a7a');
      R(ctx, x + 9, 225, 1, h - 2, '#22365c');
      R(ctx, x, 223, 10, 1, '#3d5f9a');
      disc(ctx, x + 4, 228, 2, '#f4f1e8');
      R(ctx, x + 4, 228, 1, 1, '#2f4a7a');
    }
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
    ctx.fillStyle = isManager ? '#a8741a' : '#6b4428';
    ctx.fillRect(x, y + 2, w, h - 4); ctx.fillRect(x + 2, y, w - 4, h);
    ctx.fillStyle = isManager ? '#ffe08a' : '#fff8e6';
    ctx.fillRect(x + 2, y + 2, w - 4, h - 4);
    ctx.fillStyle = '#4a2e1a';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(text, cx, cy + 1);
  }

  function nameOf(p) { return (p.rank ? p.rank + ' ' : '') + p.name; }

  /** 화면 그리기. clean=true 이면 저장용(꽃가루 없이, 흔들림 없이) */
  function render(clean) {
    var t = state.time, done = state.phase === 'done';
    var a = artCtx;
    a.drawImage(bg, 0, 0);

    // 등불 일렁임
    a.globalAlpha = clean ? 0.14 : 0.12 + 0.05 * Math.sin(t * 2.3);
    LANTERNS.forEach(function (l) { disc(a, l.x, l.y + 1, 12, '#ffd27a'); });
    ANDONS.forEach(function (n) { disc(a, n.x, n.y, 11, '#ffe9a8'); });
    a.globalAlpha = 1;

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

    drawNoren(a, clean ? 0 : t);

    // 확대해서 본 화면에 출력
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(art, 0, 0, canvas.width, canvas.height);
    ctx.setTransform(SS, 0, 0, SS, 0, 0);

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
      ctx.fillStyle = '#6b4428'; ctx.fillRect(bx, by + 3, bw, bh - 6); ctx.fillRect(bx + 3, by, bw - 6, bh);
      ctx.fillStyle = '#fff8e6'; ctx.fillRect(bx + 3, by + 3, bw - 6, bh - 6);
      ctx.fillStyle = '#d9463e'; ctx.fillRect(bx + 8, by + 8, 6, bh - 16); ctx.fillRect(bx + bw - 14, by + 8, 6, bh - 16);
      ctx.fillStyle = '#4a2e1a';
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
      ph === 'ready' ? '[시작]을 누르면 직원들이 노렌을 지나 입장합니다.' :
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
