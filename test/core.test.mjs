import test from 'node:test';
import assert from 'node:assert/strict';
import {load} from './extract.mjs';

const NAMES=['ROUTE','L1','DAY','iso','parse','weekStart','mid','RPE','q','num','extraFrom','paceStr',
  'parseCSV','toCSV','arrivals','altAt','gainAt','pace','streakOf','monthly',
  'CODE','b64enc','b64dec','toCode','fromCode'];
const mk=entries=>{const state={entries,ack:0};return {state,C:load(NAMES,state)}};

test('CSV 导出再导入，记录一条不少、字段不变',()=>{
  const {C}=mk([
    {id:'a',date:'2026-01-02',km:5,note:'带"引号", 逗号',min:60,inc:3,rpe:2},
    {id:'b',date:'2026-01-01',km:6.5},
  ]);
  const rows=C.parseCSV(C.toCSV());
  assert.equal(rows.length,2);
  assert.deepEqual(rows[0],{date:'2026-01-01',km:6.5,note:undefined});
  assert.deepEqual(rows[1],{date:'2026-01-02',km:5,note:'带"引号", 逗号',min:60,inc:3,rpe:2});
});

test('CSV 解析跳过表头、空行和坏行',()=>{
  const {C}=mk([]);
  const rows=C.parseCSV('﻿日期,公里\n\n2026-1-1,5\nabc,3\n2026-02-03,0\n2026-02-03,4.26\n');
  assert.deepEqual(rows,[{date:'2026-02-03',km:4.3,note:undefined}]);
});

test('到站日期按累计公里算',()=>{
  const {C}=mk([{date:'2026-01-03',km:100},{date:'2026-01-01',km:30},{date:'2026-01-02',km:5}]);
  const a=C.arrivals();
  assert.equal(a[0],'2026-01-01');          // 家
  assert.equal(a[120],'2026-01-03');        // 广州：30+5+100=135 ≥ 120
  assert.equal(a[710],undefined);
});

test('海拔在站点上取原值、站点之间线性插值、越界取端点',()=>{
  const {C}=mk([]);
  assert.equal(C.altAt(0),50);
  assert.equal(C.altAt(2480),2560);
  assert.equal(C.altAt(2495),(2560+4298)/2);
  assert.equal(C.altAt(-5),50);
  assert.equal(C.altAt(99999),C.ROUTE[C.ROUTE.length-1].alt);
  assert.equal(C.gainAt(0),0);
  assert.ok(C.gainAt(5442)>C.gainAt(4240));
});

test('配速格式',()=>{
  const {C}=mk([]);
  assert.equal(C.paceStr(60,5),"12'00\"");
  assert.equal(C.paceStr(31,3),"10'20\"");
  assert.equal(C.paceStr(0,5),'');
});

test('连续周数：本周没走不算断，缺一周就断',()=>{
  const {C}=mk([]);
  const ws=C.weekStart(new Date()).getTime();
  const d=t=>C.iso(new Date(t));
  const e=(t,km=5)=>({date:d(t),km});
  // 本周 2 天，上周、上上周各 1 天
  let r=C.streakOf([e(ws),e(ws+C.DAY),e(ws-3*C.DAY),e(ws-10*C.DAY)],ws);
  assert.deepEqual(r,{weeks:3,days:2});
  // 本周还没走：从上周起算，仍是连续 2 周
  r=C.streakOf([e(ws-3*C.DAY),e(ws-10*C.DAY)],ws);
  assert.deepEqual(r,{weeks:2,days:0});
  // 上周空着：本周 1 周，更早的不算
  r=C.streakOf([e(ws),e(ws-14*C.DAY)],ws);
  assert.deepEqual(r,{weeks:1,days:1});
  assert.deepEqual(C.streakOf([],ws),{weeks:0,days:0});
});

test('按月小结：公里、天数、配速只算有时长的、爬升按坡度',()=>{
  const entries=[
    {date:'2026-03-01',km:5,min:50,inc:2},
    {date:'2026-03-01',km:3},
    {date:'2026-03-09',km:4,min:40},
    {date:'2026-02-20',km:10},
  ];
  const {C}=mk(entries);
  const m=C.monthly(entries);
  assert.equal(m.length,2);
  assert.equal(m[0].m,'2026-03');
  assert.equal(m[0].km,12);
  assert.equal(m[0].days,2);
  assert.equal(m[0].n,3);
  assert.equal(C.paceStr(m[0].min,m[0].mkm),"10'00\"");
  assert.equal(m[0].up,100);                 // 5 km × 2% = 100 m
  assert.equal(m[1].m,'2026-02');
  assert.equal(m[1].up,0);
});

test('备份码：中文备注来回不变，空白可以随便断行，坏码报错',()=>{
  const entries=[{id:'x',date:'2026-05-05',km:7.5,note:'雅安 · 雨',min:80,inc:4,rpe:3},{id:'y',date:'2026-05-06',km:2}];
  const {C}=mk(entries);
  const code=C.toCode({entries,ack:0});
  assert.ok(code.startsWith('G318:'));
  const back=C.fromCode(code.replace(/(.{20})/g,'$1\n '));
  assert.deepEqual(back,[
    {date:'2026-05-05',km:7.5,note:'雅安 · 雨',min:80,inc:4,rpe:3},
    {date:'2026-05-06',km:2,note:undefined}]);
  assert.throws(()=>C.fromCode('hello'));
  assert.throws(()=>C.fromCode('G318:!!!!'));
});

test('近四周速度：只看窗口内的记录',()=>{
  const {C}=mk([]);
  const today=C.mid(Date.now());
  const st={entries:[{date:C.iso(new Date(today)),km:7},{date:C.iso(new Date(today-40*C.DAY)),km:100}],ack:0};
  const D=load(NAMES,st);
  const p=D.pace();
  assert.equal(p.win,28);
  assert.equal(p.n,2);
  assert.ok(Math.abs(p.perDay-7/28)<1e-9);
});
