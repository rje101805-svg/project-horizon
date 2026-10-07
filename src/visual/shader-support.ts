import Phaser from 'phaser';
// Preflight before adding any effect to the display list. A failed optional
// program cannot poison the gameplay renderer; temporary GL resources are deleted.
export function optionalShader(scene:Phaser.Scene,key:string,fragment:string,x:number,y:number,width:number,height:number,uniforms:object,textures?:string[]):Phaser.GameObjects.Shader|null {
 if(scene.game.renderer.type!==Phaser.WEBGL)return null;
 const gl=(scene.game.renderer as Phaser.Renderer.WebGL.WebGLRenderer).gl;
 const base=new Phaser.Display.BaseShader(key,fragment,undefined,uniforms);
 const shaders:WebGLShader[]=[];let program:WebGLProgram|null=null;
 try{
  for(const [type,source] of [[gl.VERTEX_SHADER,base.vertexSrc],[gl.FRAGMENT_SHADER,fragment]] as const){const shader=gl.createShader(type);if(!shader)return null;shaders.push(shader);gl.shaderSource(shader,source);gl.compileShader(shader);if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS))return null;}
  program=gl.createProgram();if(!program)return null;for(const s of shaders)gl.attachShader(program,s);gl.linkProgram(program);if(!gl.getProgramParameter(program,gl.LINK_STATUS))return null;
  return scene.add.shader(base,x,y,width,height,textures);
 }catch{return null;}finally{for(const s of shaders)gl.deleteShader(s);if(program)gl.deleteProgram(program);}
}
