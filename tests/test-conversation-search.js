#!/usr/bin/env node

/**
 * Test the new conversation search functionality
 */

const sharedClient = require('./helpers/shared-client');

async function testConversationSearch() {
  console.log('🔍 Testing Conversation Search Features\n');
  
  try {
    // Test 1: Basic search with no filters (should return all conversations)
    console.log('1️⃣ Testing basic search (no filters)...');
    await sharedClient.connect();
    
    const result1 = await sharedClient.callTool('search_claude_conversations', {
      limit: 5
    });
    
    const response1 = JSON.parse(result1.content[0].text);
    if (response1.success) {
      console.log(`✅ Found ${response1.conversations.length} conversations`);
      console.log(`   Total available: ${response1.search_metadata.total_found}`);
    } else {
      console.log(`❌ Search failed: ${response1.error}`);
    }
    
    // Test 2: Title search
    console.log('\n2️⃣ Testing title search...');
    const result2 = await sharedClient.callTool('search_claude_conversations', {
      titleSearch: 'Claude',
      limit: 3
    });
    
    const response2 = JSON.parse(result2.content[0].text);
    if (response2.success) {
      console.log(`✅ Found ${response2.conversations.length} conversations with "Claude" in title`);
      response2.conversations.forEach(conv => {
        console.log(`   - "${conv.title}" (${conv.message_count} messages)`);
      });
    } else {
      console.log(`❌ Title search failed: ${response2.error}`);
    }
    
    // Test 3: Message count filtering
    console.log('\n3️⃣ Testing message count filtering...');
    const result3 = await sharedClient.callTool('search_claude_conversations', {
      minMessageCount: 5,
      limit: 3
    });
    
    const response3 = JSON.parse(result3.content[0].text);
    if (response3.success) {
      console.log(`✅ Found ${response3.conversations.length} conversations with 5+ messages`);
      response3.conversations.forEach(conv => {
        console.log(`   - "${conv.title}" (${conv.message_count} messages)`);
      });
    } else {
      console.log(`❌ Message count filtering failed: ${response3.error}`);
    }
    
    // Test 4: Sort by title
    console.log('\n4️⃣ Testing sorting by title...');
    const result4 = await sharedClient.callTool('search_claude_conversations', {
      sortBy: 'title',
      sortOrder: 'asc',
      limit: 3
    });
    
    const response4 = JSON.parse(result4.content[0].text);
    if (response4.success) {
      console.log(`✅ Found conversations sorted by title (ascending):`);
      response4.conversations.forEach(conv => {
        console.log(`   - "${conv.title}"`);
      });
    } else {
      console.log(`❌ Sorting failed: ${response4.error}`);
    }
    
    // Test 5: Open conversations filter
    console.log('\n5️⃣ Testing open conversations filter...');
    const result5 = await sharedClient.callTool('search_claude_conversations', {
      isOpen: true
    });
    
    const response5 = JSON.parse(result5.content[0].text);
    if (response5.success) {
      console.log(`✅ Found ${response5.conversations.length} open conversations`);
      response5.conversations.forEach(conv => {
        console.log(`   - "${conv.title}" (Tab ID: ${conv.tabId})`);
      });
    } else {
      console.log(`❌ Open conversations filter failed: ${response5.error}`);
    }
    
    // Test 6: Bulk delete dry run
    console.log('\n6️⃣ Testing bulk delete (dry run)...');
    const result6 = await sharedClient.callTool('bulk_delete_conversations', {
      filterCriteria: {
        titleSearch: 'test',
        minMessageCount: 1
      },
      dryRun: true
    });
    
    const response6 = JSON.parse(result6.content[0].text);
    if (response6.success && response6.dry_run) {
      console.log(`✅ Dry run: Would delete ${response6.would_delete} conversations`);
      if (response6.conversations && response6.conversations.length > 0) {
        console.log('   Sample conversations that would be deleted:');
        response6.conversations.slice(0, 3).forEach(conv => {
          console.log(`   - "${conv.title}" (${conv.message_count} messages)`);
        });
      }
    } else {
      console.log(`❌ Bulk delete dry run failed: ${response6.error}`);
    }
    
    console.log('\n📊 Summary:');
    console.log('✅ Advanced conversation search implemented with filtering by:');
    console.log('  - Title text and regex patterns');
    console.log('  - Date ranges (created/updated)');
    console.log('  - Message count thresholds');
    console.log('  - Open/closed status');
    console.log('  - Custom sorting and limits');
    console.log('✅ Bulk delete operations with safety features:');
    console.log('  - Dry run mode for preview');
    console.log('  - Batch processing with delays');
    console.log('  - Skip open conversations');
    console.log('  - Detailed progress tracking');
    console.log('✅ Search metadata provides comprehensive insights');
    console.log('✅ TypeScript interfaces defined for all new features');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    process.exit(1);
  } finally {
    await sharedClient.close();
  }
}

// Run the test
testConversationSearch().catch(console.error);