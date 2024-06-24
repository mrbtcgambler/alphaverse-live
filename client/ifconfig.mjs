import fetch from 'node-fetch';
import { exec } from 'child_process';

// Helper function to use curl to get the IP address
const getIpWithCurl = () => {
    return new Promise((resolve, reject) => {
      exec("curl -s ifconfig.io", (error, stdout, stderr) => { // Added the -s flag here
        if (error) {
          reject(error);
          return;
        }
      if (stderr) {
        reject(new Error(stderr));
        return;
      }
      resolve(stdout.trim()); // Trim to remove any extra whitespace
    });
  });
};

export default async function getIpAddress() {
    try {
        // Try to get the IP with curl first
        return await getIpWithCurl();
    } catch (curlError) {
        console.error('Error retrieving IP with curl:', curlError.message);
        // If curl fails, try to fetch from ifconfig.me
        try {
            const response = await fetch('https://ifconfig.me/ip');
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const ipAddress = await response.text();
            if (ipAddress.includes('<html>')) {
                throw new Error('Invalid IP address format');
            }
            return ipAddress;
        } catch (fetchError) {
            console.error('Error retrieving IP with fetch:', fetchError.message);
            return 'N/A';
        }
    }
}
