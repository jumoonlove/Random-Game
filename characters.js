/* ============================================================
 * characters.js  —  회식 참석자 데이터
 * ------------------------------------------------------------
 * 이 파일의 데이터만 고치면 캐릭터 생김새와 이름표가 바뀝니다.
 *
 * 필드 설명
 *   id         : 고유 번호 (겹치지 않게)
 *   name       : 이름
 *   rank       : 직급  → 이름표는 "직급 이름" 으로 표시됩니다
 *   isManager  : 지점장 여부 (true 인 사람이 고정석에 앉습니다. 1명만!)
 *   gender     : 'M' | 'F'
 *   hairStyle  : 'short'(짧은 머리) | 'part'(가르마) | 'bangs'(앞머리)
 *                'bob'(단발) | 'long'(긴 머리) | 'ponytail'(묶은 머리)
 *                'bun'(올림머리) | 'curly'(곱슬) | 'spiky'(삐죽) | 'bald'(민머리)
 *   hairColor  : 'black' | 'darkbrown' | 'brown' | 'lightbrown' | 'gray'
 *                | 'blonde' | 'red'  또는 '#rrggbb' 색상 코드
 *   glasses    : true | false
 *   skinTone   : 'light' | 'fair' | 'tan' | 'dark'  또는 '#rrggbb'
 *   clothColor : 옷 색 '#rrggbb'
 *   team       : (선택) 팀 이름. 화면에는 표시되지 않으며,
 *                나중에 "같은 팀 떨어뜨리기" 규칙에서 사용합니다.
 * ============================================================ */

window.CHARACTERS = [
  { id: 1,  name: '홍길동', rank: '지점장', isManager: true,  gender: 'M', hairStyle: 'part',     hairColor: 'gray',       glasses: true,  skinTone: 'fair',  clothColor: '#3b4a6b', team: '' },

  { id: 2,  name: '직원1',  rank: '부장',   isManager: false, gender: 'M', hairStyle: 'short',    hairColor: 'black',      glasses: true,  skinTone: 'tan',   clothColor: '#5b6b7a', team: 'A' },
  { id: 3,  name: '직원2',  rank: '차장',   isManager: false, gender: 'F', hairStyle: 'bob',      hairColor: 'darkbrown',  glasses: false, skinTone: 'light', clothColor: '#c8607a', team: 'A' },
  { id: 4,  name: '직원3',  rank: '차장',   isManager: false, gender: 'M', hairStyle: 'bald',     hairColor: 'black',      glasses: false, skinTone: 'fair',  clothColor: '#4f7d5c', team: 'B' },
  { id: 5,  name: '직원4',  rank: '과장',   isManager: false, gender: 'F', hairStyle: 'long',     hairColor: 'black',      glasses: true,  skinTone: 'fair',  clothColor: '#7a5fb0', team: 'B' },
  { id: 6,  name: '직원5',  rank: '과장',   isManager: false, gender: 'M', hairStyle: 'part',     hairColor: 'darkbrown',  glasses: false, skinTone: 'tan',   clothColor: '#3f7fb5', team: 'C' },
  { id: 7,  name: '직원6',  rank: '과장',   isManager: false, gender: 'F', hairStyle: 'ponytail', hairColor: 'brown',      glasses: false, skinTone: 'light', clothColor: '#e08a3c', team: 'C' },
  { id: 8,  name: '직원7',  rank: '대리',   isManager: false, gender: 'M', hairStyle: 'spiky',    hairColor: 'black',      glasses: false, skinTone: 'fair',  clothColor: '#d15a4a', team: 'A' },
  { id: 9,  name: '직원8',  rank: '대리',   isManager: false, gender: 'F', hairStyle: 'bun',      hairColor: 'darkbrown',  glasses: true,  skinTone: 'fair',  clothColor: '#4aa3a0', team: 'B' },
  { id: 10, name: '직원9',  rank: '대리',   isManager: false, gender: 'M', hairStyle: 'curly',    hairColor: 'brown',      glasses: false, skinTone: 'dark',  clothColor: '#e3b23c', team: 'C' },
  { id: 11, name: '직원10', rank: '대리',   isManager: false, gender: 'F', hairStyle: 'bangs',    hairColor: 'lightbrown', glasses: false, skinTone: 'light', clothColor: '#6fae5a', team: 'A' },
  { id: 12, name: '직원11', rank: '대리',   isManager: false, gender: 'M', hairStyle: 'bangs',    hairColor: 'black',      glasses: true,  skinTone: 'tan',   clothColor: '#8a6d4b', team: 'B' },
  { id: 13, name: '직원12', rank: '주임',   isManager: false, gender: 'F', hairStyle: 'long',     hairColor: 'brown',      glasses: false, skinTone: 'tan',   clothColor: '#e5749a', team: 'C' },
  { id: 14, name: '직원13', rank: '주임',   isManager: false, gender: 'M', hairStyle: 'short',    hairColor: 'darkbrown',  glasses: false, skinTone: 'light', clothColor: '#5a8fd0', team: 'A' },
  { id: 15, name: '직원14', rank: '주임',   isManager: false, gender: 'F', hairStyle: 'bob',      hairColor: 'black',      glasses: true,  skinTone: 'fair',  clothColor: '#b0563c', team: 'B' },
  { id: 16, name: '직원15', rank: '사원',   isManager: false, gender: 'M', hairStyle: 'curly',    hairColor: 'black',      glasses: true,  skinTone: 'fair',  clothColor: '#57a773', team: 'C' },
  { id: 17, name: '직원16', rank: '사원',   isManager: false, gender: 'F', hairStyle: 'ponytail', hairColor: 'black',      glasses: false, skinTone: 'fair',  clothColor: '#f0c14b', team: 'A' },
  { id: 18, name: '직원17', rank: '사원',   isManager: false, gender: 'M', hairStyle: 'spiky',    hairColor: 'lightbrown', glasses: false, skinTone: 'tan',   clothColor: '#9a6fc2', team: 'B' }
];
