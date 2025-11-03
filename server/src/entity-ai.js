import { quat, vec3 } from 'gl-matrix'

export const entity_ai = (() => {

    class StateMachine {
        #state = null
        #entity = null
        #terrain = null
        
        constructor(entity, terrain) {
            this.#entity = entity
            this.#terrain = terrain
        }

        setState(state) {
            const prevState = this.#state

            if (prevState) {
                if (prevState.constructor.name != state.constructor.name) {
                    prevState.exit()
                }
            }
            
            this.#state = state
            this.#state.parent = this
            this.#state.entity = this.#entity
            this.#state.terrain = this.#terrain
            
            state.enter(prevState)
        }

        update(timeElapsed) {
            if (this.#state) {
                this.#state.update(timeElapsed)
            }
        }
    }
    
    class State {
        entity = null
        
        constructor() {}
        
        exit() {}
        enter() {}
        
        update(timeElapsed) {}
    }
        
    class State_Idle extends State {
        #timer = 0.0
        parent = null
        
        constructor() {
            super()
        }

        #updateLogic() {
            // find all players within 50 units
            // who have still have some health
            const nearby = 
                this.entity.getNearby(50.0)
                    .filter(e => e.stats.health > 0)
                    .filter(e => e.client !== null)
            
            if (nearby.length > 0) {
                this.parent.setState(new State_FollowToAttack(nearby[0]))
            }
        }
        
        update(timeElapsed) {
            this.#timer += timeElapsed
            this.entity.setState('idle')
            
            if (this.#timer > 5.0) {
                this.#updateLogic()
                this.#timer = 0.0
            }
        }
    }
    
    class State_IdleAttackDone extends State {
        #target = null
        
        constructor(target) {
            super()
            
            this.#target = target
        }
    
        update(_) {
            this.entity.state = 'attack'
            
            if (this.entity.action === null) {
                this.parent.setState(new State_FollowToAttack(this.#target))
            }
        }
    }
    
    class State_FollowToAttack extends State {
        #target = null
        
        constructor(target) {
            super()
            
            this.#target = target
        }

        #updateMovement(timeElapsed) {
            this.entity.state = 'walk'
            
            const direction = vec3.create()
            const forward = vec3.fromValues(0, 0, 1)
            
            vec3.sub(direction, this.#target.position, this.entity.position)
            direction[1] = 0.0
            
            vec3.normalize(direction, direction)
            quat.rotationTo(this.entity.rotation, forward, direction)
            
            const movement = vec3.clone(direction)
            vec3.scale(movement, movement, timeElapsed * 10.0)
            
            vec3.add(this.entity.position, this.entity.position, movement)
            
            this.entity.position[1] = this.terrain.Get(...this.entity.position)[0]
            this.entity.updateGridClient()
            
            const distance = vec3.distance(this.entity.position, this.#target.position)
            
            if (distance < 10.0) {
                this.entity.onActionAttack()
                this.parent.setState(new State_IdleAttackDone(this.#target))
            } else if (distance > 100.0) {
                this.parent.setState(new State_Idle())
            }
        }
        
        update(timeElapsed) {
            if (this.#target.gridClient === null || this.#target.stats.health == 0) {
                this.parent.setState(new State_Idle(this.#target))
                return
            }

            this.#updateMovement(timeElapsed)
        }
    }
    
    return {
        StateMachine: StateMachine,
        State_Idle: State_Idle
    }

})()