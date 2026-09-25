import type {KoneFormState,StudioRecipe} from './studio';
import {selectedFormKind,selectFormKind,formKinds,formMatte,blendFormTile,type FormTile} from './formComposition';
export type FormPart={id:string;label:string;enabled:boolean;form:KoneFormState;sourceImage?:string};
export const formPartControls=[['formPartX','Across',-.5,1.5,.01,.5],['formPartY','Down',-.5,1.5,.01,.5],['formPartScale','Size',.1,2,.01,1],['formPartTurn','Turn',-180,180,1,0],['formPartOpacity','Presence',0,1,.01,1]].map(([id,label,min,max,step,value])=>({id:String(id),label:String(label),description:String(label),min:Number(min),max:Number(max),step:Number(step),default:Number(value)}));
export function formParts(recipe:StudioRecipe):FormPart[]{
 if(recipe.formStack)return recipe.formStack.map(part=>part.id===recipe.formSelected?{...part,form:recipe.koneForm,sourceImage:recipe.sourceImage}:part);
 const p=recipe.koneForm.parameters;
 if((p.formMix??0)>=.5)return [...formKinds].filter(k=>(p[`formMix${k}`]??0)>=.5).sort((a,b)=>(p[`formMix${a}Order`]??0)-(p[`formMix${b}Order`]??0)).map(kind=>({id:`legacy-${kind}`,label:kind==='Figure'?'Figures':kind==='Kone'?'KONE & plants':'Knot',enabled:(p[`formMix${kind}Visible`]??1)>=.5,sourceImage:recipe.sourceImage,form:{...recipe.koneForm,seed:(p[`formMix${kind}Seed`]??-1)>=0?p[`formMix${kind}Seed`]:recipe.koneForm.seed,parameters:{...selectFormKind(p,kind),formMix:0,...Object.fromEntries(['X','Y','Scale','Turn','Opacity'].map(s=>[`formPart${s}`,p[`formMix${kind}${s}`]??(s==='X'||s==='Y'?.5:s==='Turn'?0:1)]))}}}));
 return [{id:'original-form',label:selectedFormKind(p)==='Kone'?'KONE & plants':selectedFormKind(p)==='Knot'?'Knot':'Figures',enabled:true,form:recipe.koneForm,sourceImage:recipe.sourceImage}];
}
export function selectFormPart(recipe:StudioRecipe,id:string):StudioRecipe{
 const parts=formParts(recipe),part=parts.find(p=>p.id===id);if(!part)return recipe;
 return {...recipe,revision:recipe.revision+1,formStack:parts,formSelected:id,koneForm:part.form,sourceImage:part.sourceImage};
}
export function addFormPart(recipe:StudioRecipe,form:KoneFormState,label:string):StudioRecipe{
 const id=`form-${Date.now()}-${Math.random().toString(36).slice(2,8)}`,part={id,label,enabled:true,form,sourceImage:recipe.sourceImage};
 return {...recipe,revision:recipe.revision+1,formStack:[...formParts(recipe),part],formSelected:id,koneForm:form,baseMode:'kone',processStage:'form'};
}
export function removeFormPart(recipe:StudioRecipe,id:string):StudioRecipe{
 const parts=formParts(recipe).filter(p=>p.id!==id),selected=recipe.formSelected??'original-form';
 const next={...recipe,revision:recipe.revision+1,formStack:parts};
 return selected===id&&parts.length?{...next,formSelected:parts[parts.length-1].id,koneForm:parts[parts.length-1].form,sourceImage:parts[parts.length-1].sourceImage}:next;
}
export function moveFormPart(recipe:StudioRecipe,id:string,direction:number):StudioRecipe{
 const parts=formParts(recipe),i=parts.findIndex(p=>p.id===id),j=i+direction;if(i<0||j<0||j>=parts.length)return recipe;
 [parts[i],parts[j]]=[parts[j],parts[i]];return {...recipe,revision:recipe.revision+1,formStack:parts,formSelected:recipe.formSelected??'original-form'};
}
export function renderFormStack(w:number,h:number,recipe:StudioRecipe,render:(part:FormPart,ground:number)=>HTMLCanvasElement):HTMLCanvasElement{
 const canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;const ctx=canvas.getContext('2d')!,ground=recipe.palette[3];
 let data=new Uint8ClampedArray(w*h*4);for(let i=0;i<data.length;i+=4)data.set([(ground>>16)&255,(ground>>8)&255,ground&255,255],i);
 const tile=(c:HTMLCanvasElement):FormTile=>({width:c.width,height:c.height,data:c.getContext('2d')!.getImageData(0,0,c.width,c.height).data});
 for(const part of formParts(recipe)){
  if(!part.enabled)continue;const src=formMatte(tile(render(part,0)),tile(render(part,0xffffff))),p=part.form.parameters;
  // The same pixel transform is used for any material family and in Processing.
  blendFormTile(data,w,h,src,p.formPartX??.5,p.formPartY??.5,p.formPartScale??1,p.formPartTurn??0,p.formPartOpacity??1);
 }
 ctx.putImageData(new ImageData(data,w,h),0,0);return canvas;
}
