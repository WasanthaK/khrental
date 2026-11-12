import test from 'node:test';
import assert from 'node:assert/strict';
import eslintInternals from 'eslint/use-at-your-own-risk';
const lint=new eslintInternals.FlatESLint();
for(const source of ['Date.now()',"Date['now']()",'new Date()','Date()']){
  test(`billing lint rejects direct system time: ${source}`,async()=>{
    const [result]=await lint.lintText(`export const value=${source};`,{filePath:'src/api/managementBilling/service.js'});
    assert.ok(result.messages.some(m=>m.ruleId==='no-restricted-syntax'));
  });
}
test('billing lint permits injected time and the single production clock adapter',async()=>{
  for(const [filePath,code] of [['src/api/managementBilling/service.js','export const date=clock=>new Date(clock.now());'],
    ['src/api/managementBilling/clock.js','export const clock={now:()=>Date.now()};']]){
    const [result]=await lint.lintText(code,{filePath});assert.equal(result.errorCount,0);
  }
});
