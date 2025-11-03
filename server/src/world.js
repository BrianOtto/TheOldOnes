import { vec3 } from 'gl-matrix'
import { performance } from 'perf_hooks'

import { entity } from './entity.js'

import { shared_grids } from '../../client/shared/grids.js'
import { shared_noise } from '../../client/shared/noise.js'


export const world = (() => {
    
    class Server {
        clients = {}
        
        constructor(io) {
            // generate the world
            this.world = new World()
            
            io.on('connection', socket => {
                // add the client when they connect
                this.clients[socket.id] = new Client(this, socket)
            })
        }
        
        #tick(t1) {
            setTimeout(() => {
                let t2 = performance.now()
                let timeElapsed = (t2 - t1) * 0.001
                
                // update everything in the world
                this.world.update(timeElapsed)
                
                this.#tick(t2)
            })
        }
        
        run() {
            // start updating the world on every tick
            this.#tick(performance.now())
        }
    }
    
    class Client {
        player = {}
        
        constructor(server, socket) {
            this.server = server
            this.socket = socket

            // parse any events that come in
            this.socket.onAny((event, data) => {
                this.onMessage(event, data)
            })
        }
        
        onMessage(event, data) {
            switch (event) {
                // the player logged in
                case 'login.commit' :
                    // TODO: create a method to authenticate 
                    // the player and load their data from a DB
                    
                    // get the player's name
                    this.player.name = data
                    
                    // choose a random skin
                    // TODO: get this from their account
                    const models = ['sorceror', 'paladin']
                    this.player.class = models[
                        Math.floor(Math.random() * models.length)
                    ]
                    
                    // place them randomly around the center of the grid
                    // TODO: get this from their last saved position
                    const playerX = -60 + (Math.random() * 2 - 1) * 20
                    const playerZ = (Math.random() * 2 - 1) * 20
                    
                    this.player.position = vec3.fromValues(playerX, 0, playerZ)

                    console.log('Player Login: ' + this.player.name)
                    
                    // spawn the player in the world
                    this.server.world.spawnPlayer(this)
                    
                    break
                default :
                    console.error('Unknown Message: ' + event)
            }
        }
        
        send(event, data) {
            // send a custom event to the server
            this.socket.emit(event, data)
        }
        
        disconnect() {
            // disconnect from the server
            this.socket.disconnect()
        }
    }
    
    class World {
        entityId = 0
        entities = []
        spawners = []
        tickTime = 0.0
        
        constructor() {
            // generate a grid for our terrain
            // TODO: get the world dimensions from a config
            this.grid = new shared_grids.SpatialHashGrid(
                [[-4000, -4000], [4000, 4000]], [1000, 1000]
            )
            
            // generate our terrain
            this.terrain = new shared_noise.HeightGenerator()
            
            // spawn the mobs
            this.spawnMobiles()
            
        }
        
        spawnMobiles() {
            // spawn the mobs randomly around the world
            for (let x = -40; x <= 40; ++x) {
                for (let z = -40; z <= 40; ++z) {
                    if (Math.random() < 0.1) {
                        const mobile = {}
                        
                        // choose a random mobile
                        // TODO: get the mobs from a biome config
                        const models = ['warrok', 'zombie']
                        mobile.class = models[
                            Math.floor(Math.random() * models.length)
                        ]
                        
                        // space them out by 75 units
                        mobile.position = vec3.fromValues(x * 75, 0, z * 75)
                        
                        // spawn the mobile
                        const wm = new entity.SpawnMobile(this, mobile)
                        
                        // add them to the world
                        this.spawners.push(wm)
                    }
                }
            }
        }
        
        spawnPlayer(client) {
            // spawn the player
            const wp = new entity.WorldPlayer(this, client)
            
            // add them to the world
            this.entities.push(wp)

            // send an announcement to all players
            wp.broadcastChat({
                name: '',
                server: true,
                text: '[' + client.player.name + ' has entered the game]'
            })
        }

        update(timeElapsed) {
            // update the state of the world
            this.#updateClientState(timeElapsed)
            this.#updateEntities(timeElapsed)
            this.#updateSpawners(timeElapsed)
        }

        #updateClientState(timeElapsed) {
            this.tickTime += timeElapsed
            
            // wait at least 0.1 seconds before updating state
            if (this.tickTime < 0.1) {
                return
            }
            
            this.tickTime = 0.0
            
            // determine what entities are nearby
            for (let i = 0; i < this.entities.length; ++i) {
                this.entities[i].updateClientState()
            }
            
            // clear our entities events
            for (let i = 0; i < this.entities.length; ++i) {
                if (this.entities[i].entity) {
                    this.entities[i].entity.events = []
                } else {
                    this.entities[i].events = []
                }
            }
        }
        
        #updateEntities(timeElapsed) {
            const death = []
            const alive = []

            for (let i = 0; i < this.entities.length; ++i) {
                const e = this.entities[i]
                
                // perform an action
                e.update(timeElapsed)
                
                // did they die
                if (e.isDead) {
                    death.push(e)
                } else {
                    alive.push(e)
                }
            }
            
            // remove all dead entities
            this.entities = alive
            
            // kill the entity
            for (let d of death) {
                d.onDeath()
            }
        }
        
        #updateSpawners(timeElapsed) {
            // respawn our mobs
            for (let i = 0; i < this.spawners.length; ++i) {
                this.spawners[i].update(timeElapsed)
            }
        }
    }
    
    return {
        Server: Server
    }
  
})()