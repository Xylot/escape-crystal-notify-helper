// The downloadable patch replaces whole files. Reduce it for the review UI.
export function reviewDiff(patch) {
  return patch.split(/(?=^--- a\/)/m).filter(Boolean).map(section=>{
    const lines=section.split('\n'), before=[],after=[];
    for(const line of lines.slice(2)) {
      if(line.startsWith('-'))before.push(line.slice(1));
      else if(line.startsWith('+'))after.push(line.slice(1));
      else if(line.startsWith(' ')){before.push(line.slice(1));after.push(line.slice(1));}
    }
    const width=after.length+1,table=new Uint32Array((before.length+1)*width);
    for(let i=before.length-1;i>=0;i--)for(let j=after.length-1;j>=0;j--)
      table[i*width+j]=before[i]===after[j]?1+table[(i+1)*width+j+1]:Math.max(table[(i+1)*width+j],table[i*width+j+1]);
    const changes=[];let i=0,j=0;
    while(i<before.length||j<after.length){
      if(i<before.length&&j<after.length&&before[i]===after[j]){i++;j++;}
      else if(i<before.length&&(j===after.length||table[(i+1)*width+j]>=table[i*width+j+1]))changes.push({kind:'removed',line:++i,text:before[i-1]});
      else changes.push({kind:'added',line:++j,text:after[j-1]});
    }
    return {path:lines[1]?.replace(/^\+\+\+ b\//,''),changes};
  }).filter(file=>file.changes.length);
}
