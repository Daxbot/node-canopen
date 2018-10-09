class VirtualChannel {
    constructor() {
        this.callbacks = [];
    }

    send(message) {
        console.log("\t", message.id.toString(16), message.data);
        for(let i = 0; i < this.callbacks.length; i++)
            this.callbacks[i](message);
    }

    addListener(event, callback, instance) {
        this.callbacks.push(callback.bind(instance));
    }
}

module.exports=exports=VirtualChannel;
