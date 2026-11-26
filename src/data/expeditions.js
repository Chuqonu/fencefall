export const EXPEDITION_ORDER = Object.freeze([
  'watch',
  'wires',
  'plate',
  'dust',
  'mend',
  'leap',
  'shade',
  'banner',
  'ward',
  'cinder',
  'hush',
  'gauntlet',
]);

const missions = [
  ['wires','Wire Rush','线驰突进','Runners and leapers','突进与跃袭','runner','leaper'],
  ['plate','Plate Weight','板甲重压','Armor and brutes','重甲与蛮兽','armored','brute'],
  ['dust','Dust Brood','尘裂','Swarms and splitters','虫群与裂变','swarm','splitter'],
  ['mend','Mender Line','修补队列','Healers behind tanks','坦后面的治疗','mender','armored'],
  ['leap','Leap Ash','灰跃','Leapers','跃袭','leaper','runner'],
  ['shade','Shade Hour','栅影时刻','Phasing shades','虚化的栅影','shade','spitter'],
  ['banner','Wretched Standard','旗孽','Speed banners','加速旗帜','banner','runner'],
  ['ward','Ash Ward','烬卫','Shielded packs','护盾队列','warden','armored'],
  ['cinder','Cinder Line','烬爆','Fuse charges','引线爆弹','charge','runner'],
  ['hush','Ash Hush','烬寂','Slowed board','静场','hush','swarm'],
  ['gauntlet','Mixed Gate','混合闸门','All roles, then a boss','全部角色，然后是首领','brute','boss']
];
const pack=(kind,count,interval,healthScale=1)=>({kind,count,interval,healthScale});
const phase=(id,from,until,every,name,groups)=>({id,from,until,every,name,groups});
export const EXPEDITIONS = {watch:{id:'watch',name:{en:'The Long Watch',zh:'长夜守望'},
  minutes:7,focus:{en:'Full campaign',zh:'完整战役'},summary:{en:'Three flags and two bosses in a seven-minute watch.',zh:'七分钟守望，迎击三次旗帜大波与两名首领。'}}};
for (const [id,en,zh,focusEn,focusZh,first,last] of missions) {
  const name={en,zh}, focus={en:focusEn,zh:focusZh};
  const small=['swarm','runner','shambler'].includes(first);
  EXPEDITIONS[id]={id,name,focus,minutes:3,summary:focus,phases:[
    phase('opening',0,1,1,name,[pack('shambler',6,0.65,0.42)]),
    phase('scout',13,44,10,name,[pack('swarm',6,1),pack(first,small?3:1,1,1)]),
    phase('march',46,105,10,name,[pack('swarm',12,0.65),pack('shambler',5,1.5),pack(first,small?5:1,1)]),
    phase('siege',108,167,10,name,[pack('swarm',16,0.5),pack('runner',4,1.2),pack(first,small?8:2,1)]),
    phase('last',170,171,1,name,[pack(last,last==='boss'?1:5,1.4,last==='boss'?0.5:1),pack('swarm',16,0.5)])
  ]};
}
export function isExpedition(id) {
  return typeof id === 'string' && Object.prototype.hasOwnProperty.call(EXPEDITIONS, id);
}

freezeDeep(EXPEDITIONS);
freezeDeep(EXPEDITION_ORDER);

function freezeDeep(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const key of Object.keys(value)) freezeDeep(value[key]);
  return Object.freeze(value);
}
