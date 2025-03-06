import { request } from 'stun';
 
request('stun.l.google.com:19302', (err, res) => {
  if (err) {
    console.error(err);
  } else {
    const { address, port } = res.getXorAddress();
    console.log('your ip', address);
    console.log('Your port: ', port);
  }

});
 
// or with promise
 
const res = await request('stun.l.google.com:19302');
console.log('your ip', res.getXorAddress().address);