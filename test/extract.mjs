// 从 index.html 里把纯函数按名字抠出来，在 node 里跑测试。
// 页面本身是单文件，不想为了测试拆成模块，所以用这个小扫描器：
// 找到 `function NAME(` 或 `const/let NAME=`，按括号配对读到语句结束。
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {dirname,join} from 'node:path';

const html=readFileSync(join(dirname(fileURLToPath(import.meta.url)),'..','index.html'),'utf8');
const src=html.slice(html.indexOf('<script>')+8,html.lastIndexOf('</script>'));

function statementAt(i){
  let depth=0,j=i,q=null;
  for(;j<src.length;j++){
    const c=src[j];
    if(q){ if(c==='\\'){j++;continue} if(c===q)q=null; continue }
    if(c==="'"||c==='"'||c==='`'){q=c;continue}
    if(c==='/'&&src[j+1]==='/'){j=src.indexOf('\n',j);continue}
    if(c==='/'){                                   // 正则字面量：前面是运算符或括号就当正则，跳到收尾的 /
      let k=j-1;while(k>=0&&src[k]===' ')k--;
      if(k<0||'(,=:[!&|?{};+'.includes(src[k])){
        let cls=false;
        for(j++;j<src.length;j++){const d=src[j];
          if(d==='\\'){j++;continue}
          if(cls){if(d===']')cls=false;continue}
          if(d==='[')cls=true;else if(d==='/')break}
        continue}
    }
    if('([{'.includes(c))depth++;
    else if(')]}'.includes(c)){depth--; if(depth===0&&src.startsWith('function',i)&&c==='}')return src.slice(i,j+1)}
    else if(depth===0&&(c===';'||c==='\n')&&!src.startsWith('function',i))return src.slice(i,j+1);
  }
  throw new Error('unterminated statement at '+i);
}
export function extract(name){
  const m=new RegExp(`^(function ${name}\\(|(?:const|let) ${name}=)`,'m').exec(src);
  if(!m)throw new Error('not found: '+name);
  return statementAt(m.index);
}
// 把一组函数装进一个作用域，state 从外面传进来
export function load(names,state){
  const body=names.map(extract).join('\n');
  return new Function('state',body+'\nreturn {'+names.join(',')+'};')(state);
}
