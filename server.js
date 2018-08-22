const express = require( 'express' );
const redis = require( 'redis' );
const { promisify } = require( 'util' );
// Promisify client object
[ 'set', 'get', 'del' ].forEach( prop => {
   redis.RedisClient.prototype[ prop ] = promisify( redis.RedisClient.prototype[ prop ] );
} );

function streamToString( stream ) {
   let buffer = '';
   return new Promise( resolve => {
      stream.on( 'data', chunk => buffer += chunk.toString() );
      stream.on( 'end', _ => resolve( buffer ) );
   } );
}

const client = redis.createClient( process.env.REDIS_PORT, process.env.REDIS_HOST, { password: process.env.REDIS_PASSWORD } );
client.on( 'error', err => console.error( err.toString() ) );
let redisConnection = new Promise( resolve => client.on( 'connect', _ => resolve( client ) ) );
client.on( 'end', _ => {
   redisConnection = new Promise( resolve => client.on( 'reconnect', _ => resolve( client ) ) );
} );

const app = express();
app.get( '/room/:room/:slot', async ( req, res ) => {
   const con = await redisConnection;
   const offer = await con.get( `room:${req.params.room}:${req.params.slot}` );
   if ( !offer )
      res.send( 'null' );
   else
      res.send( offer );
} );
app.post( '/room/:room/:slot', async ( req, res ) => {
   const con = await redisConnection;
   await con.set( `room:${req.params.room}:${req.params.slot}`, await streamToString( req ) );
   res.sendStatus( 204 );
} );
app.delete( '/room/:room', async ( req, res ) => {
   const con = await redisConnection;
   await con.del( `room:${req.params.room}:1` );
   await con.del( `room:${req.params.room}:2` );
   res.sendStatus( 204 );
} );


app.use( express.static( 'static' ) );
app.listen( process.env.PORT );
