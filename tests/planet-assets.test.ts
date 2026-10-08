import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {inflateSync} from 'node:zlib';
// Decode the committed 8-bit RGB/RGBA PNGs so seams/material coverage are tested,
// rather than merely checking file names or trusting the generator's report.
function png(name:string){
 const file=readFileSync(new URL(`../public/planets/${name}.png`,import.meta.url)),parts:Buffer[]=[];
 let width=0,height=0,channels=0;
 for(let p=8;p<file.length;){const size=file.readUInt32BE(p),kind=file.toString('ascii',p+4,p+8),data=file.subarray(p+8,p+8+size);if(kind==='IHDR'){width=data.readUInt32BE(0);height=data.readUInt32BE(4);assert.equal(data[8],8);channels=data[9]===6?4:3;assert.ok(data[9]===6||data[9]===2);assert.equal(data[12],0);}if(kind==='IDAT')parts.push(data);p+=12+size;}
 const raw=inflateSync(Buffer.concat(parts)),stride=width*channels,out=Buffer.alloc(stride*height);
 const paeth=(a:number,b:number,c:number)=>{const p=a+b-c,da=Math.abs(p-a),db=Math.abs(p-b),dc=Math.abs(p-c);return da<=db&&da<=dc?a:db<=dc?b:c;};
 for(let y=0;y<height;y++){const filter=raw[y*(stride+1)];assert.ok(filter<=4);for(let x=0;x<stride;x++){const at=y*stride+x,a=x>=channels?out[at-channels]:0,b=y?out[at-stride]:0,c=y&&x>=channels?out[at-stride-channels]:0;out[at]=(raw[y*(stride+1)+1+x]+(filter===1?a:filter===2?b:filter===3?Math.floor((a+b)/2):filter===4?paeth(a,b,c):0))&255;}}
 return {width,height,channels,out};
}
test('refined source maps add resolution, preserve horizontal seams and bound molten coverage',()=>{
 for(const name of ['ice','volcanic','terrestrial','moon','clouds','ice-detail','volcanic-detail','terrestrial-detail','moon-detail']){
  const p=png(name),small=name==='ice-detail'||name==='terrestrial-detail';assert.equal(p.width,small?512:name==='clouds'?1024:2048);assert.equal(p.height,p.width/2);
  const stride=p.width*p.channels;for(let y=0;y<p.height;y++)assert.deepEqual(p.out.subarray(y*stride,y*stride+p.channels),p.out.subarray((y+1)*stride-p.channels,(y+1)*stride));
  if(p.channels===4&&name!=='clouds')for(let i=3;i<p.out.length;i+=4)assert.equal(p.out[i],255);
  if(name==='volcanic-detail'){let hot=0;for(let i=0;i<p.out.length;i+=p.channels)if(p.out[i]>64)hot++;assert.ok(hot/(p.width*p.height)<.12,`hot lava coverage ${hot/(p.width*p.height)}`);}
  if(name==='moon-detail'){let varied=0;for(let i=0;i<p.out.length;i+=p.channels){assert.ok(p.out[i+2]>=127);if(Math.abs(p.out[i]-128)>8||Math.abs(p.out[i+1]-128)>8)varied++;}assert.ok(varied>p.width*p.height*.02);}
 }
});
