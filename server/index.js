import * as http from 'http'
import * as io from 'socket.io'
import express from 'express'

import { world } from './src/world.js'

function main() {
    const app = express()
    const appPort = process.env.PORT || 3000
    const appServer = http.createServer(app)
    
    // limit the app server to same origin requests only
    // this gives us access to SharedArrayBuffer objects
    app.use(express.static('../client', {
        setHeaders: (res) => {
            res.set('Cross-Origin-Opener-Policy', 'same-origin')
            res.set('Cross-Origin-Embedder-Policy', 'require-corp')
        }
    }))
    
    // display all server errors in the console
    // and return a HTTP 500 status
    app.use((err, req, res, next) => {
        console.error(err.stack)
        res.status(500).send('Internal Server Error')
    })
    
    // start listening for connections
    appServer.listen(appPort, () => {
        console.log('Listening on http://localhost:' + appPort)
    })
    
    // start the world
    new world.Server(new io.Server(appServer)).run()
}

// call main() only when this module is run directly
if (import.meta.main) {
    main()
}
