# SDO File Transfer Example

This example shows a simple file transfer between a client and server using a
DOMAIN object.

# Usage

1. (Optional) Generate a test file using `file_generate.js`

    ```
    $ ./file_generate.js raw_data.txt 40960
    Generating 40960 bytes of random data
    ```

2. Start your CAN network (e.g., vcan) and run `file_server.js`

3. In a new terminal run `file_write.js` to write the file to the server.
Note that depending on transfer size this may take a few seconds.

    ```
    $ ./file_write.js raw_data.txt data1.txt
    ```

4. Read the file back from the server using `file_read.js`

    ```
    $ ./file_read.js data1.txt data2.txt
    The file is 40960 bytes
    Got 40960 bytes
    ```

5. Check the md5sum of each file, they should match

    ```
    $ md5sum raw_data.txt 
    a22de936573a761c3e4209d3bc8dc9c8  raw_data.txt
    $ md5sum data1.txt 
    a22de936573a761c3e4209d3bc8dc9c8  data1.txt
    $ md5sum data2.txt 
    a22de936573a761c3e4209d3bc8dc9c8  data2.txt
    ```