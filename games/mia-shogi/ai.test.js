'use strict';

/* ai.js の純粋関数（パース/検証/プロンプト生成）の検証: node games/mia-shogi/ai.test.js */

const E = require('./engine.js');
const AI = require('./ai.js');

let pass = 0, fail = 0;
function check(name, cond) {
  if (cond) { pass++; console.log('  ✅ ' + name); }
  else { fail++; console.log('  ❌ ' + name); }
}

console.log('--- JSONフェンス除去 ---');
{
  check('```json フェンスを除去', AI.stripJsonFences('```json\n{"a":1}\n```') === '{"a":1}');
  check('``` だけのフェンスも除去', AI.stripJsonFences('```\n{"a":1}\n```') === '{"a":1}');
  check('フェンス無しはそのまま', AI.stripJsonFences('{"a":1}') === '{"a":1}');
}

console.log('--- JSONパース ---');
{
  check('素のJSON', AI.parseAiJson('{"moveIndex":2,"comment":"やぁ"}').moveIndex === 2);
  check('フェンス付きJSON', AI.parseAiJson('```json\n{"moveIndex":0}\n```').moveIndex === 0);
  check('前置き付きでも{}を抽出', AI.parseAiJson('はい、こちらです: {"moveIndex":1} どうぞ').moveIndex === 1);
  check('壊れたJSONはnull', AI.parseAiJson('これはJSONじゃない') === null);
}

console.log('--- moveIndex 範囲検証 ---');
{
  check('範囲内はそのまま', AI.validMoveIndex({ moveIndex: 3 }, 10) === 3);
  check('範囲外(上限)は-1', AI.validMoveIndex({ moveIndex: 10 }, 10) === -1);
  check('負数は-1', AI.validMoveIndex({ moveIndex: -1 }, 10) === -1);
  check('未定義は-1', AI.validMoveIndex({}, 10) === -1);
  check('数値以外は-1', AI.validMoveIndex({ moveIndex: '2' }, 10) === -1);
  check('小数は切り捨てて検証', AI.validMoveIndex({ moveIndex: 2.9 }, 10) === 2);
}

console.log('--- プロンプト生成（初期局面） ---');
{
  const s = E.initialState();
  const moves = E.legalMoves(s);
  const prompt = AI.buildMovePrompt(s, moves, { opponentName: 'レイン', tone: 'ツンデレ', difficulty: 'normal' });
  check('相手名が含まれる', prompt.includes('レイン'));
  check('合法手の番号レンジ(0〜29)が含まれる', prompt.includes(`0〜${moves.length - 1}`));
  check('moveIndexのJSON指示が含まれる', prompt.includes('moveIndex'));
  check('合法手リストの行数が手数と一致', AI.movesList(s, moves).split('\n').length === moves.length);

  const assist = AI.buildAssistPrompt(s, moves, { selfName: 'ミア', tone: '元気', strategyName: '四間飛車', castle: '美濃囲い' });
  check('アシストに戦法名が含まれる', assist.includes('四間飛車'));
  check('アシストにreason指示が含まれる', assist.includes('reason'));
}

console.log('--- 手の文章化（打ち込み/移動） ---');
{
  const s = E.initialState();
  const drop = { from: null, to: [4, 4], drop: 'P', promote: false };
  check('打ち込みの記述', AI.describeMove(s, drop).includes('打つ'));
  const move = { from: [6, 0], to: [5, 0], drop: null, promote: false };
  check('移動の記述に座標が入る', AI.describeMove(s, move).includes('(6,0)→(5,0)'));
}

console.log('');
console.log(`結果: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
