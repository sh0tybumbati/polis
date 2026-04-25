export default class GameStateManager {
    constructor() {
        this.state = {
            score: 0,
            playerHealth: 100,
            // Add other game state properties as needed
        };
        console.log('GameStateManager initialized.');
    }

    // --- Score Management ---
    getScore() {
        return this.state.score;
    }

    setScore(newScore) {
        console.log(`GameStateManager: Score set to ${newScore}`);
        this.state.score = newScore;
        // Potentially emit an event or update UI here
    }

    addScore(amount) {
        this.setScore(this.state.score + amount);
    }

    // --- Player Health Management ---
    getPlayerHealth() {
        return this.state.playerHealth;
    }

    setPlayerHealth(newHealth) {
        console.log(`GameStateManager: Player health set to ${newHealth}`);
        this.state.playerHealth = Math.max(0, newHealth); // Health cannot go below 0
        // Potentially emit an event or update UI here
    }

    damagePlayer(amount) {
        this.setPlayerHealth(this.state.playerHealth - amount);
        if (this.state.playerHealth <= 0) {
            console.log('GameStateManager: Player has run out of health!');
            // Handle player death logic
        }
    }

    // --- Add other state management methods as needed ---
    // e.g., for inventory, level progression, settings, etc.
}
