import { quat, vec3 } from 'gl-matrix'

import { entity_action } from './entity-action.js'
import { entity_ai } from './entity-ai.js'

import { defs } from '../../client/lib/shared/defs.js'

export const entity = (() => {

    class SpawnMobile {
        entity = null
        
        constructor(world, mobile) {
            this.world = world
            this.mobile = mobile
            this.mobile.position[1] = 
                this.world.terrain.Get(...this.mobile.position)[0]
        }

        #spawn() {
            const wc = new WorldMobile(this.world, this.mobile, this.world.terrain, () => {
                console.log('A ' + this.entity.name + ' is respawning soon ...')
                
                // TODO: remove dead mobiles from the world
                // this.entity.Destroy()
                
                this.entity = null
            })
            
            this.world.entities.push(wc)
            this.entity = wc
        }

        update(timeElapsed) {
            if (this.entity === null) {
                this.#spawn()
            }
        }
    }

    class WorldEntity {
        events = []
        action = null
        client = null
        nearbyCache = {}
        
        #timeout = defs.TIMEOUT
        
        constructor(world, client) {
            const entity = (client.player) ? client.player : client.mobile
            
            this.id = world.entityId++
            this.state = 'idle'
            this.model = defs.CHARACTER_MODELS[entity.class]
            this.position = entity.position
            this.rotation = quat.fromValues(0, 0, 0, 1)
            
            this.name = (entity.name) ? entity.name : this.model.name
            this.class = entity.class
            this.inventory = {...this.model.inventory}
            this.stats = {...this.model.stats}
            
            this.grid = world.grid
            this.gridClient = this.grid.NewClient([this.position[0], this.position[2]], [10, 10])
            this.gridClient.entity = this
                
            this.client = client
            this.client.onMessage = (e, d) => this.onMessage(e, d)
            this.client.send('world.player', this.createPlayerPacket())
            this.client.send('world.stats', this.createStatsPacket())
            
            if (client.mobile) {
                // mobiles never time out
                this.#timeout = 1000.0
            }
        }
        
        destroy() {
            if (this.client) {
                this.client.disconnect(true)
                this.client = null
            }
            
            this.grid.Remove(this.gridClient)
            this.gridClient = null
        }
        
        getDescription() {
            // TODO: consolidate these into a single object
            // the client side "desc." will need to be updated 
            // in a lot of different places (e.g. spawners.js)
            return {
                account: {
                    name: this.name
                },
                character: {
                    class: this.class,
                    inventory: this.inventory
                }
            }
        }
        
        createPlayerPacket() {
            return {
                id: this.id,
                desc: this.getDescription(),
                transform: this.createTransformPacket()
            }
        }

        createStatsPacket() {
            return [this.id, this.stats]
        }

        createEventsPacket() {
            return this.events
        }

        createTransformPacket() {
            return [
                this.state,
                [...this.position],
                [...this.rotation]
            ]
        }
        
        onActionAttack() {
            if (this.action) {
                return
            }

            this.action = new entity_action.Attack(
                this.model.attack.timing,
                this.model.attack.cooldown,
                () => {
                    this.onActionAttack_Fired()
                }
            )
        }
      
        onActionAttack_Fired() {
            // TODO: base this on the entity's class / equipment
            const nearby = this.getNearby(50.0)

            const attackableFilter = (c) => {
                if (c.stats.health == 0) {
                    return false
                }

                const distance = vec3.distance(c.position, this.position)
                return distance <= this.model.attack.range
            }

            const attackable = nearby.filter(attackableFilter)
            
            for (let a of attackable) {
                const target = a

                const dirToTarget = vec3.create()
                vec3.sub(dirToTarget, target.position, this.position)
                vec3.normalize(dirToTarget, dirToTarget)

                const forward = vec3.fromValues(0, 0, 1)
                vec3.transformQuat(forward, forward, this.rotation)
                vec3.normalize(forward, forward)

                const dot = vec3.dot(forward, dirToTarget)
                
                if (dot < 0.9 || dot > 1.1) {
                    continue
                }
            
                let damage = 0

                console.log(this.name + ' is attacking ' + target.name)
                
                // TODO: include weapoon stats in this calculation
                if (this.model.attack.type == 'melee') {
                    damage = (this.stats.strength / 5.0)

                    const equipped = this.inventory['inventory-equip-1']
                    
                    if (equipped) {
                        console.log(this.name + ' is attacking with a ' + equipped)
                        
                        const weapon = defs.WEAPONS_DATA[equipped]
                        
                        if (weapon) {
                            damage *= weapon.damage * 10
                        }
                    }
                } else {
                    damage = (this.stats.wisdomness / 10.0)
                }
                
                console.log(this.name + ' hit ' + target.name + ' for ' + damage + ' damage')
                
                target.onDamage(this, damage)
                
                this.onEntityEvent('attack.damage', { target: target, damage: damage })
            }
        }
      
        onDamage(attacker, damage) {
            this.stats.health -= damage
            this.stats.health = Math.max(0.0, this.stats.health)
            
            this.events.push({
                type: 'attack',
                target: this.id,
                attacker: attacker.id,
                amount: damage
            })

            if (this.stats.health <= 0) {
                this.setState('death')
                
                console.log('A ' + this.name + ' Died !') 
            }
        }
      
        setState(s) {
            if (this.state != 'death') {
                this.state = s
            }
        }

        getNearby(radius, includeSelf) {
            let nearby = this.grid.FindNear(
                [this.position[0], this.position[2]], [radius, radius]
            ).map(c => c.entity)

            if (!includeSelf) {
                nearby = nearby.filter((e) => {
                    return e.id != this.id
                })
            }
            
            return nearby
        }
        
        onEntityEvent(t, d) {
            if (t == 'attack.damage') {
                this.onDamageEvent(d)
            }
        }

        onMessage(evt, data) {
            this.#timeout = defs.TIMEOUT

            if (evt == 'world.update') {
                this.updateTransform(data)
                return true
            }

            if (evt == 'chat.msg') {
                this.onChatMessage(data)
                return true
            }

            if (evt == 'action.attack') {
                this.onActionAttack()
                return true
            }

            if (evt == 'world.inventory') {
                this.onInventoryChanged(data)
                return true
            }

            return false
        }

        onInventoryChanged(inventory) {
            this.updateInventory(inventory)

            // TODO: add this to the nearby cache
            const nearby = this.getNearby(50, true)

            for (let n of nearby) {
                n.client.send('world.inventory', [this.id, inventory])
            }
        }

        onChatMessage(message) {
            const chatMessage = {
                name: this.name,
                text: message,
            }

            this.broadcastChat(chatMessage)
        }

        onDamageEvent(_) {}
        
        onUpdate(timeElapsed) {}
        
        broadcastChat(chatMessage) {  
            const nearby = this.getNearby(50, true)
            
            for (let i = 0; i < nearby.length; ++i) {
                nearby[i].client.send('chat.message', chatMessage)
            }
        }

        get isDead() {
            return this.#timeout <= 0.0
        }
        
        updateTransform(transformData) {
            if (this.stats.health <= 0) {
                this.setState('death')
            }
            
            this.state = transformData[0]
            this.position = vec3.fromValues(...transformData[1])
            this.rotation = quat.fromValues(...transformData[2])
            
            this.updateGridClient()
        }

        updateGridClient() {
            this.gridClient.position = [this.position[0], this.position[2]]
            this.grid.UpdateClient(this.gridClient)
        }

        updateInventory(inventory) {
            this.inventory = inventory
        }

        updateClientState() {
            this.onUpdateClientState()
        }
        
        updateActions(timeElapsed) {
            if (!this.action) {
                // TODO: check all events
                if (this.state == 'attack') {
                    this.setState('idle')
                }
                
                return
            }
            
            this.action.update(timeElapsed)

            if (this.action.isFinished) {
                this.action = null
                this.setState('idle')
            }
        }
        
        update(timeElapsed) {
            this.#timeout -= timeElapsed
            
            this.updateActions(timeElapsed)
            
            this.onUpdate(timeElapsed)
        }
    }
    
    class WorldPlayer extends WorldEntity {
        constructor(world, client) {
            super(world, client)
        }
        
        onUpdateClientState() {
            const nearby = this.getNearby(500).filter(e => (e) => {
                return e.id != this.id
            })
            
            const update = [{
                id: this.id,
                stats: this.createStatsPacket(),
                events: this.createEventsPacket()
            }]
            
            const nearbyCacheNew = {}
            
            for (let n of nearby) {
                const cur = {
                    id: n.id,
                    transform: n.createTransformPacket(),
                    stats: n.createStatsPacket(),
                    events: n.createEventsPacket()
                }
                
                if (!(n.id in this.nearbyCache)) {
                    cur.desc = n.getDescription()
                }
                
                nearbyCacheNew[n.id] = cur
                update.push(cur)
            }
            
            this.nearbyCache = nearbyCacheNew
            
            this.client.send('world.update', update)
        }
    }

    class FakeClient {
        constructor(mobile) {
            this.mobile = mobile
        }
        
        send(msg, data) {}
        
        disconnect() {}
    }
    
    class WorldMobile extends WorldEntity {
        // TODO: configure this in the character model
        #deathTimer = 0.0
        
        constructor(world, mobile, terrain, onDeath) {
            super(world, new FakeClient(mobile))
            
            this.terrain = terrain
            this.onDeath = onDeath
            
            this.fsm = new entity_ai.StateMachine(this, this.terrain)
            this.fsm.setState(new entity_ai.State_Idle())
        }
        
        get isDead() {
            return this.#deathTimer >= 30.0
        }
        
        onDeath() {
            this.onDeath()
        }
        
        onUpdateClientState() {}
        
        onUpdate(timeElapsed) {
            if (this.stats.health > 0) {
                this.fsm.update(timeElapsed)
            } else {
                this.#deathTimer += timeElapsed
            }
        }
    }
    
    return {
        SpawnMobile: SpawnMobile,
        WorldPlayer: WorldPlayer
    }

})()