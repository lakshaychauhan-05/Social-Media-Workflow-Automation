// post-to-social.js

export async function postToPlatforms(post) {
    const platforms = ["WordPress", "Twitter", "LinkedIn", "Facebook", "Instagram"];
    
    for (const platform of platforms) {
        console.log(`Posting "${post.title}" to ${platform}...`);
        // Mock delay
        await new Promise(res => setTimeout(res, 500));
        console.log(`✅ Posted to ${platform}`);
    }
    
    return true;
}
