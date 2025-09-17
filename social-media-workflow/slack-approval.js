// slack-approval.js

export async function requestApproval(post) {
    console.log(`\nRequesting approval for post: "${post.title}"`);
    
    // Mock: randomly approve or reject
    const approved = Math.random() > 0.3; // 70% chance approve
    console.log(approved ? "✅ Approved" : "❌ Rejected");
    
    return approved;
}
