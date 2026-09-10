export function checkZip(buffer,files) {
 const data=Buffer.from(buffer);let end=-1;
 for(let i=data.length-22;i>=Math.max(0,data.length-65557);i--)if(data.readUInt32LE(i)===0x06054b50){end=i;break;}
 if(end<0)throw new Error('ZIP end record is missing.');
 let offset=data.readUInt32LE(end+16),count=data.readUInt16LE(end+10);const seen=new Set();
 for(let n=0;n<count;n++){
  if(offset+46>data.length||data.readUInt32LE(offset)!==0x02014b50)throw new Error('Invalid ZIP directory.');
  const expected=data.readUInt32LE(offset+16),size=data.readUInt32LE(offset+24),length=data.readUInt16LE(offset+28),extra=data.readUInt16LE(offset+30),comment=data.readUInt16LE(offset+32);
  const name=data.subarray(offset+46,offset+46+length).toString('utf8');if(seen.has(name)||name.split('/').includes('..')||name.startsWith('/'))throw new Error('Invalid or duplicate ZIP member.');seen.add(name);
  const bytes=files[name];if(!bytes||bytes.length!==size)throw new Error('ZIP member size mismatch: '+name);
  let crc=0xffffffff;for(const byte of bytes){crc^=byte;for(let i=0;i<8;i++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}if(((crc^0xffffffff)>>>0)!==expected)throw new Error('ZIP CRC mismatch: '+name);
  offset+=46+length+extra+comment;
 }
 return files;
}
