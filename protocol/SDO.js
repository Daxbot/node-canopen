class SDO
{
    constructor(device)
    {
        this.device = device;
    }

    read(name)
    {
        return new Promise((resolve, reject)=>{
            resolve();
        });
    }

    write(name, value)
    {
        return new Promise((resolve, reject)=>{
            resolve();
        });
    }

};

module.exports=exports=SDO;