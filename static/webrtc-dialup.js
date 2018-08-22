( function ( scope ) {
   async function personInRoom( room ) {
      const connection = new RTCPeerConnection( {
         iceServers: [
            {
               urls: "stun:stun.l.google.com:19302",
            },
         ],
      } );

      let remoteDescription = await offerInRoomSlot( room, 1 );
      let remoteCandidates;
      if ( !remoteDescription ) {
         const channel = new Promise( resolve => {
            const c = connection.createDataChannel( 'comlink', null );
            c.onopen = ( { target } ) => {
               if ( target.readyState === 'open' )
                  resolve( c );
            };
         } );
         const localDescription = new RTCSessionDescription( await connection.createOffer() );
         console.log( `Offer:`, localDescription );
         const candidates = collectIceCandidates( connection );
         connection.setLocalDescription( localDescription );
         const offer = [ localDescription, await candidates ];
         console.log( `Candidates:`, await candidates );
         await putOfferInRoomSlot( offer, room, 1 );
         [ remoteDescription, remoteCandidates ] = await pollOfferInRoomSlot( room, 2 );
         connection.setRemoteDescription( remoteDescription );
         remoteCandidates.forEach( c => connection.addIceCandidate( c ) );
         await emptySlotsInRoom( room );
         return { channel: await channel, role: 'owner' };
      } else {
         const channel = new Promise( resolve => {
            connection.ondatachannel = ( { channel } ) => resolve( channel );
         } );
         [ remoteDescription, remoteCandidates ] = remoteDescription;
         connection.setRemoteDescription( remoteDescription );
         remoteCandidates.forEach( c => connection.addIceCandidate( c ) );
         const localDescription = new RTCSessionDescription( await connection.createAnswer() );
         console.log( `Answer:`, localDescription );
         const candidates = collectIceCandidates( connection );
         connection.setLocalDescription( localDescription );
         await putOfferInRoomSlot( [ localDescription, await candidates ], room, 2 );
         console.log( `Candidates:`, await candidates );
         await pollForNull( room, 1 );
         return { channel: await channel, role: 'client' };
      }
   }

   async function offerInRoomSlot( room, slot ) {
      const responseStream = await fetch( `/room/${room}/${slot}` );
      let jsonResponse = await responseStream.json();
      if ( !jsonResponse )
         return null;
      const [ jsonOffer, jsonCandidates ] = jsonResponse;
      return [ new RTCSessionDescription( jsonOffer ), jsonCandidates.map( c => new RTCIceCandidate( c ) ) ];
   }

   async function pollOfferInRoomSlot( room, slot ) {
      while ( true ) {
         const offer = await offerInRoomSlot( room, slot );
         if ( offer )
            return offer;
         await asyncSleep( 1000 );
      }
   }

   async function putOfferInRoomSlot( offer, room, slot ) {
      const body = JSON.stringify( [ offer[ 0 ].toJSON(), offer[ 1 ].map( c => c.toJSON() ) ] );
      await fetch( `/room/${room}/${slot}`, {
         method: 'POST',
         body,
      } );
   }

   async function emptySlotsInRoom( room ) {
      await fetch( `/room/${room}`, { method: 'DELETE' } );
   }

   async function pollForNull( room, slot ) {
      while ( true ) {
         const offer = await offerInRoomSlot( room, slot );
         if ( !offer )
            return;
         await asyncSleep( 1000 );
      }
   }

   function collectIceCandidates( connection ) {
      let candidates = [];
      connection.onicecandidate = ( { candidate } ) => {
         if ( !candidate ) return;
         candidates.push( candidate );
      };
      return new Promise( resolve => {
         connection.onicegatheringstatechange = _ => {
            if ( connection.iceGatheringState === 'complete' )
               resolve( candidates );
         }
      } );
   }

   async function asyncSleep( ms ) {
      return new Promise( resolve => {
         setTimeout( resolve, ms );
      } );
   }

   // export
   Object.assign( scope, { personInRoom } );
} )( self );
