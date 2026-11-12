/* ============================================================
 * characters.js  —  회식 참석자 데이터
 * ------------------------------------------------------------
 * 이 파일의 데이터만 고치면 캐릭터 생김새와 이름표가 바뀝니다.
 *
 * 필수 항목
 *   id         : 고유 번호 (겹치지 않게)
 *   name       : 이름
 *   rank       : 직급  → 이름표는 "직급 이름" 으로 표시됩니다
 *   isManager  : 지점장 여부 (true 인 사람이 고정석에 앉습니다. 1명만!)
 *   gender     : 'M' | 'F'
 *
 * 머리
 *   hairStyle  : [남] 'up'(짧은 올림머리) | 'waveUp'(웨이브 올림머리) | 'buzz'(밤톨머리)
 *                     'sanggo'(상고머리) | 'down'(내림머리) | 'downMid'(중간 길이 내림머리)
 *                     'partPerm'(가르마펌) | 'shaggy'(더벅머리) | 'bowl'(바가지머리)
 *                     'short' | 'part' | 'curly' | 'spiky' | 'bald'
 *                [여] 'longPart'(앞머리 없는 긴 생머리) | 'longWave'(여신머리)
 *                     'permPart'(가르마 파마머리) | 'bobPart'(앞머리 없는 단발)
 *                     'ponytail'(묶은 머리) | 'long' | 'bob' | 'bangs' | 'bun'
 *   hairColor  : 'black' | 'darkbrown' | 'brown' | 'lightbrown' | 'gray' | 'blonde' | 'red'
 *                또는 '#rrggbb'
 *
 * 얼굴 / 체형
 *   skinTone   : 'white' | 'light' | 'fair' | 'tan' | 'dark'  또는 '#rrggbb'
 *   glasses    : false | 'round'(동그란) | 'bigRound'(크고 동그란) | 'square'(네모)
 *   glassesFrame : 'horn'(뿔테) | 'metal'(쇠테)
 *   eyes       : 'normal' | 'big'(큰 눈) | 'pretty'(속눈썹)
 *   face       : 'normal' | 'oval'(계란형)
 *   build      : 'slim'(마름) | 'normal' | 'chubby'(통통) | 'muscular'(근육질)
 *   height     : 'normal' | 'tall'(키 큼)
 *
 * 옷
 *   top        : 'shirt'(셔츠) | 'stripe'(줄무늬 셔츠) | 'tee'(티셔츠) | 'polo'(카라티)
 *                'sweat'(맨투맨) | 'knit'(니트) | 'cardigan'(가디건+안에 티)
 *                'jacket'(정장 재킷) | 'zipup'(집업) | 'blouse'(블라우스) | 'offshoulder'(오프숄더)
 *   sleeve     : 'long' | 'short'
 *   clothColor : 윗옷 색 '#rrggbb'
 *   innerColor : (가디건·재킷) 안에 입은 옷 색, (줄무늬 셔츠) 줄무늬 색
 *   bottom     : 'pants'(긴바지) | 'longskirt'(긴치마) | 'skirt'(짧은 치마)
 *   pantsColor : 바지/치마 색 '#rrggbb'
 *
 *   team       : (선택) 팀 이름. 화면에는 표시되지 않으며,
 *                나중에 "같은 팀 떨어뜨리기" 규칙에서 사용합니다.
 * ============================================================ */

(function () {
  // 자주 쓰는 색
  var WHITE = '#f4f4f0', BLACK = '#2a2a30', NAVY = '#2b3f6b', GRAY = '#9aa0a8',
      BEIGE = '#d8c39a', KHAKI = '#7d8450', JEANS = '#4a6fa5';

  window.CHARACTERS = [
    { id: 1,  name: '황준규', rank: '지점장',   isManager: true,  gender: 'M',
      hairStyle: 'buzz', hairColor: 'black', skinTone: 'fair', glasses: 'square', glassesFrame: 'metal', build: 'slim',
      top: 'sweat', sleeve: 'long', clothColor: NAVY, bottom: 'pants', pantsColor: BEIGE, team: '' },

    { id: 2,  name: '이승석', rank: '부지점장', isManager: false, gender: 'M',
      hairStyle: 'downMid', hairColor: 'black', skinTone: 'fair', glasses: 'round', glassesFrame: 'metal', build: 'chubby',
      top: 'sweat', sleeve: 'long', clothColor: GRAY, bottom: 'pants', pantsColor: BLACK, team: '' },

    { id: 3,  name: '전성식', rank: '팀장',     isManager: false, gender: 'M',
      hairStyle: 'waveUp', hairColor: 'black', skinTone: 'fair', glasses: 'bigRound', glassesFrame: 'horn', build: 'chubby',
      top: 'shirt', sleeve: 'long', clothColor: NAVY, bottom: 'pants', pantsColor: JEANS, team: '' },

    { id: 4,  name: '문종원', rank: '팀장',     isManager: false, gender: 'M',
      hairStyle: 'sanggo', hairColor: 'black', skinTone: 'fair', glasses: 'square', glassesFrame: 'metal', build: 'normal',
      top: 'stripe', sleeve: 'long', clothColor: WHITE, innerColor: '#5a8fd0', bottom: 'pants', pantsColor: BEIGE, team: '' },

    { id: 5,  name: '이창현', rank: '차장',     isManager: false, gender: 'M',
      hairStyle: 'up', hairColor: 'black', skinTone: 'fair', glasses: 'square', glassesFrame: 'horn', build: 'slim',
      top: 'polo', sleeve: 'short', clothColor: BLACK, bottom: 'pants', pantsColor: BLACK, team: '' },

    { id: 6,  name: '양만형', rank: '차장',     isManager: false, gender: 'M',
      hairStyle: 'up', hairColor: 'black', skinTone: 'tan', glasses: 'round', glassesFrame: 'metal', build: 'muscular',
      top: 'tee', sleeve: 'short', clothColor: KHAKI, bottom: 'pants', pantsColor: BEIGE, team: '' },

    { id: 7,  name: '조지원', rank: '차장',     isManager: false, gender: 'M',
      hairStyle: 'down', hairColor: 'black', skinTone: 'fair', glasses: false, face: 'oval', build: 'normal',
      top: 'shirt', sleeve: 'long', clothColor: '#3f6fb5', bottom: 'pants', pantsColor: BEIGE, team: '' },

    { id: 8,  name: '지미김', rank: '차장',     isManager: false, gender: 'M',
      hairStyle: 'up', hairColor: 'black', skinTone: 'fair', glasses: 'square', glassesFrame: 'horn', build: 'normal', height: 'tall',
      top: 'shirt', sleeve: 'long', clothColor: WHITE, bottom: 'pants', pantsColor: JEANS, team: '' },

    { id: 9,  name: '이용진', rank: '과장',     isManager: false, gender: 'M',
      hairStyle: 'down', hairColor: 'black', skinTone: 'light', glasses: false, build: 'slim',
      top: 'knit', sleeve: 'long', clothColor: '#dcc9a0', bottom: 'pants', pantsColor: BLACK, team: '' },

    { id: 10, name: '이호원', rank: '대리',     isManager: false, gender: 'M',
      hairStyle: 'partPerm', hairColor: 'black', skinTone: 'fair', glasses: false, build: 'slim',
      top: 'polo', sleeve: 'short', clothColor: GRAY, bottom: 'pants', pantsColor: BEIGE, team: '' },

    { id: 11, name: '이주용', rank: '대리',     isManager: false, gender: 'M',
      hairStyle: 'shaggy', hairColor: 'black', skinTone: 'fair', glasses: 'round', glassesFrame: 'horn', build: 'chubby',
      top: 'shirt', sleeve: 'short', clothColor: '#e0cfa6', bottom: 'pants', pantsColor: BLACK, team: '' },

    { id: 12, name: '박진성', rank: '행원',     isManager: false, gender: 'M',
      hairStyle: 'up', hairColor: 'black', skinTone: 'fair', glasses: false, build: 'normal',
      top: 'shirt', sleeve: 'long', clothColor: WHITE, bottom: 'pants', pantsColor: KHAKI, team: '' },

    { id: 13, name: '김지현', rank: '행원',     isManager: false, gender: 'F',
      hairStyle: 'permPart', hairColor: 'black', skinTone: 'light', glasses: 'round', glassesFrame: 'horn', build: 'normal',
      top: 'cardigan', sleeve: 'long', clothColor: BLACK, innerColor: WHITE, bottom: 'pants', pantsColor: BLACK, team: '' },

    { id: 14, name: '이지원', rank: '행원',     isManager: false, gender: 'F',
      hairStyle: 'longPart', hairColor: 'black', skinTone: 'light', glasses: false, build: 'slim',
      top: 'blouse', sleeve: 'long', clothColor: '#a9d4f0', bottom: 'pants', pantsColor: '#f2f2ee', team: '' },

    { id: 15, name: '노희연', rank: '행원',     isManager: false, gender: 'F',
      hairStyle: 'longWave', hairColor: 'brown', skinTone: 'light', glasses: false, eyes: 'pretty', build: 'normal',
      top: 'cardigan', sleeve: 'long', clothColor: BLACK, innerColor: WHITE, bottom: 'longskirt', pantsColor: '#3f8a5a', team: '' },

    { id: 16, name: '권윤애', rank: '행원',     isManager: false, gender: 'F',
      hairStyle: 'bobPart', hairColor: 'brown', skinTone: 'light', glasses: false, eyes: 'big', build: 'slim',
      top: 'offshoulder', sleeve: 'long', clothColor: '#f2a0b8', bottom: 'pants', pantsColor: KHAKI, team: '' },

    { id: 17, name: '전영재', rank: '행원',     isManager: false, gender: 'M',
      hairStyle: 'bowl', hairColor: 'black', skinTone: 'fair', glasses: false, build: 'muscular',
      top: 'zipup', sleeve: 'long', clothColor: GRAY, bottom: 'pants', pantsColor: BEIGE, team: '' },

    { id: 18, name: '권다정', rank: '연수생',   isManager: false, gender: 'F',
      hairStyle: 'ponytail', hairColor: 'black', skinTone: 'white', glasses: false, build: 'normal',
      top: 'jacket', sleeve: 'long', clothColor: '#8a8f98', innerColor: WHITE, bottom: 'pants', pantsColor: '#8a8f98', team: '' }
  ];
})();
