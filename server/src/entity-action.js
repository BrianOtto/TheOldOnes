export const entity_action = (() => {

    class Attack {
        #time = 0.0
        #timeElapsed = 0.0
        
        constructor(time, cooldown, onAction) {
            this.#time = time
            this.cooldown = cooldown
            this.onAction = onAction
        }
        
        get isFinished() {
            return this.#timeElapsed > this.cooldown
        }
        
        update(timeElapsed) {
            const prevTimeElapsed = this.#timeElapsed
            this.#timeElapsed += timeElapsed
            
            if (this.#timeElapsed > this.#time && prevTimeElapsed <= this.#time) {
                this.onAction()
            }
        }
    }
    
    return {
        Attack: Attack
    }

})()