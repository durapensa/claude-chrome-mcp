/**
 * Claude.ai UI Element Discovery Framework
 * 
 * Automated discovery system for Claude.ai web UI elements and their properties.
 * Built for continuous monitoring of UI changes made by Anthropic to the platform.
 * 
 * Features:
 * - Systematic UI element discovery and cataloging
 * - Selector pattern analysis and optimization
 * - Change detection across UI versions
 * - Automated reliability testing of selectors
 * - Knowledge base of UI interaction patterns
 */

const fs = require('fs').promises;
const path = require('path');
const { DiscoveryFramework } = require('./discovery-framework');

/**
 * UI Element Discovery System
 */
class UIDiscovery extends DiscoveryFramework {
  constructor(options = {}) {
    super(options);
    this.activeUISession = null;
    this.selectorReliability = new Map();
  }

  /**
   * Start UI discovery session
   */
  async startUIDiscoverySession(sessionName, scenarios = []) {
    const session = {
      id: `ui-discovery-${Date.now()}`,
      name: sessionName,
      version: this.options.version,
      startTime: new Date().toISOString(),
      scenarios: scenarios,
      discoveries: [],
      selectorTests: []
    };

    this.activeUISession = session;
    console.log(`Started UI discovery session: ${sessionName}`);
    
    return session;
  }

  /**
   * Execute UI discovery scenario
   */
  async executeUIScenario(scenario, tabId, mcpTools) {
    if (!this.activeUISession) {
      throw new Error('No active UI discovery session. Call startUIDiscoverySession() first.');
    }

    console.log(`Executing UI scenario: ${scenario.name}`);
    
    try {
      const startTime = Date.now();
      
      // Discover elements for each selector group
      const elementDiscoveries = [];
      
      for (const selectorGroup of scenario.selectors) {
        const discovery = await this.discoverElementGroup(selectorGroup, tabId, mcpTools);
        elementDiscoveries.push(discovery);
        
        // Small delay between selector groups
        await this.delay(500);
      }
      
      const endTime = Date.now();
      
      // Analyze discovered elements
      const analysis = this.analyzeUIElements(elementDiscoveries, scenario);
      
      // Test selector reliability
      const reliabilityTests = await this.testSelectorReliability(analysis.elements, tabId, mcpTools);
      
      // Store discovery results
      const discovery = {
        scenarioName: scenario.name,
        timestamp: new Date().toISOString(),
        duration: endTime - startTime,
        elementDiscoveries: elementDiscoveries,
        analysis: analysis,
        reliabilityTests: reliabilityTests,
        discoveredElements: analysis.elements || []
      };
      
      this.activeUISession.discoveries.push(discovery);
      this.updateUIKnowledgeBase(analysis);
      
      console.log(`UI scenario complete: ${scenario.name} - Discovered ${analysis.elements?.length || 0} elements`);
      
      return discovery;
      
    } catch (error) {
      console.error(`UI scenario failed: ${scenario.name}`, error);
      throw error;
    }
  }

  /**
   * Discover elements for a specific selector group
   */
  async discoverElementGroup(selectorGroup, tabId, mcpTools) {
    const groupResults = {
      name: selectorGroup.name,
      category: selectorGroup.category,
      timestamp: new Date().toISOString(),
      patterns: [],
      elements: [],
      bestSelector: null,
      reliability: 0
    };

    // Test each pattern
    for (const pattern of selectorGroup.patterns) {
      try {
        const script = this.generateElementDiscoveryScript(
          pattern, 
          selectorGroup.attributes || [], 
          selectorGroup.properties || []
        );
        
        const result = await mcpTools.execute_script({
          tabId,
          script: script
        });
        
        if (result && result.elements && result.elements.length > 0) {
          const patternResult = {
            pattern: pattern,
            matchCount: result.elements.length,
            elements: result.elements,
            reliability: this.calculatePatternReliability(pattern, result.elements),
            timestamp: new Date().toISOString()
          };
          
          groupResults.patterns.push(patternResult);
          groupResults.elements.push(...result.elements.map(el => ({
            ...el,
            discoveredBy: pattern,
            groupName: selectorGroup.name
          })));
        }
        
      } catch (error) {
        console.warn(`Pattern failed: ${pattern}`, error.message);
        groupResults.patterns.push({
          pattern: pattern,
          matchCount: 0,
          error: error.message,
          timestamp: new Date().toISOString()
        });
      }
    }

    // Determine best selector
    if (groupResults.patterns.length > 0) {
      const bestPattern = groupResults.patterns
        .filter(p => p.matchCount > 0)
        .sort((a, b) => b.reliability - a.reliability)[0];
        
      if (bestPattern) {
        groupResults.bestSelector = bestPattern.pattern;
        groupResults.reliability = bestPattern.reliability;
      }
    }

    return groupResults;
  }

  /**
   * Generate script for element discovery
   */
  generateElementDiscoveryScript(selector, attributes = [], properties = []) {
    return `
      (function() {
        try {
          const elements = Array.from(document.querySelectorAll('${selector}'));
          const results = [];
          
          for (let i = 0; i < elements.length && i < 10; i++) { // Limit to 10 elements
            const element = elements[i];
            const elementData = {
              selector: '${selector}',
              tagName: element.tagName.toLowerCase(),
              index: i,
              attributes: {},
              properties: {},
              position: {
                x: element.offsetLeft,
                y: element.offsetTop,
                width: element.offsetWidth,
                height: element.offsetHeight
              },
              visibility: {
                visible: element.offsetParent !== null,
                displayStyle: window.getComputedStyle(element).display,
                visibilityStyle: window.getComputedStyle(element).visibility
              },
              uniqueIdentifiers: []
            };
            
            // Capture specified attributes
            const attributesToCapture = ${JSON.stringify(attributes)};
            for (const attr of attributesToCapture) {
              const value = element.getAttribute(attr);
              if (value !== null) {
                elementData.attributes[attr] = value;
              }
            }
            
            // Capture all data-* attributes
            for (const attr of element.attributes) {
              if (attr.name.startsWith('data-')) {
                elementData.attributes[attr.name] = attr.value;
              }
            }
            
            // Capture specified properties
            const propertiesToCapture = ${JSON.stringify(properties)};
            for (const prop of propertiesToCapture) {
              try {
                const value = this.getNestedProperty(element, prop);
                if (value !== undefined) {
                  elementData.properties[prop] = value;
                }
              } catch (e) {
                // Property doesn't exist or can't be accessed
              }
            }
            
            // Generate unique identifiers
            if (element.id) {
              elementData.uniqueIdentifiers.push('#' + element.id);
            }
            
            if (element.getAttribute('data-testid')) {
              elementData.uniqueIdentifiers.push('[data-testid="' + element.getAttribute('data-testid') + '"]');
            }
            
            if (element.className) {
              const classes = element.className.split(' ').filter(c => c.trim());
              if (classes.length > 0) {
                elementData.uniqueIdentifiers.push('.' + classes.join('.'));
              }
            }
            
            // Generate path-based selector
            const path = this.generateElementPath(element);
            if (path) {
              elementData.uniqueIdentifiers.push(path);
            }
            
            results.push(elementData);
          }
          
          return { elements: results, totalMatches: elements.length };
          
        } catch (error) {
          return { error: error.message, elements: [] };
        }
        
        // Helper functions
        function getNestedProperty(obj, path) {
          return path.split('.').reduce((current, key) => {
            return current && current[key] !== undefined ? current[key] : undefined;
          }, obj);
        }
        
        function generateElementPath(element) {
          if (element.id) {
            return '#' + element.id;
          }
          
          const path = [];
          let current = element;
          
          while (current && current !== document.body) {
            let selector = current.tagName.toLowerCase();
            
            if (current.className) {
              const classes = current.className.split(' ').filter(c => c.trim());
              if (classes.length > 0) {
                selector += '.' + classes[0]; // Use first class
              }
            }
            
            // Add nth-child if needed for uniqueness
            const siblings = Array.from(current.parentNode?.children || []);
            const sameTagSiblings = siblings.filter(s => s.tagName === current.tagName);
            if (sameTagSiblings.length > 1) {
              const index = sameTagSiblings.indexOf(current) + 1;
              selector += ':nth-child(' + index + ')';
            }
            
            path.unshift(selector);
            current = current.parentElement;
            
            if (path.length > 5) break; // Limit path depth
          }
          
          return path.join(' > ');
        }
      })();
    `;
  }

  /**
   * Calculate reliability score for a selector pattern
   */
  calculatePatternReliability(pattern, elements) {
    let score = 0;
    
    // Base score for finding elements
    if (elements.length > 0) {
      score += 30;
    }
    
    // Bonus for finding exactly one element (specificity)
    if (elements.length === 1) {
      score += 20;
    }
    
    // Penalty for finding too many elements (over-broad)
    if (elements.length > 5) {
      score -= 10;
    }
    
    // Bonus for using data-testid (stable selectors)
    if (pattern.includes('data-testid')) {
      score += 25;
    }
    
    // Bonus for using semantic attributes
    if (pattern.includes('role=') || pattern.includes('aria-')) {
      score += 15;
    }
    
    // Penalty for brittle selectors
    if (pattern.includes(':nth-child') || pattern.includes('> ')) {
      score -= 5;
    }
    
    // Bonus for element visibility
    const visibleElements = elements.filter(el => el.visibility?.visible);
    if (visibleElements.length === elements.length) {
      score += 10;
    }
    
    return Math.max(0, Math.min(100, score));
  }

  /**
   * Analyze discovered UI elements
   */
  analyzeUIElements(elementDiscoveries, scenario) {
    const analysis = {
      scenario: scenario.name,
      timestamp: new Date().toISOString(),
      totalGroups: elementDiscoveries.length,
      elements: [],
      patterns: [],
      changes: [],
      recommendations: []
    };

    // Combine all discovered elements
    for (const discovery of elementDiscoveries) {
      analysis.elements.push(...discovery.elements);
      
      // Check for changes from known elements
      const changes = this.detectUIChanges(discovery);
      if (changes.length > 0) {
        analysis.changes.push(...changes);
      }
    }

    // Analyze patterns across all discoveries
    analysis.patterns = this.identifyUIPatterns(elementDiscoveries);
    
    // Generate recommendations
    analysis.recommendations = this.generateUIRecommendations(elementDiscoveries);

    return analysis;
  }

  /**
   * Test selector reliability
   */
  async testSelectorReliability(elements, tabId, mcpTools) {
    const tests = [];
    
    // Group elements by their best selectors
    const selectorGroups = elements.reduce((acc, element) => {
      const selector = element.discoveredBy;
      acc[selector] = acc[selector] || [];
      acc[selector].push(element);
      return acc;
    }, {});

    // Test each selector multiple times
    for (const [selector, groupElements] of Object.entries(selectorGroups)) {
      try {
        const testResults = [];
        
        // Run test 3 times with small delays
        for (let i = 0; i < 3; i++) {
          const script = `
            const elements = document.querySelectorAll('${selector}');
            return {
              count: elements.length,
              visible: Array.from(elements).filter(el => el.offsetParent !== null).length,
              timestamp: Date.now()
            };
          `;
          
          const result = await mcpTools.execute_script({ tabId, script });
          testResults.push(result);
          
          await this.delay(1000);
        }
        
        // Calculate reliability metrics
        const counts = testResults.map(r => r.count);
        const isConsistent = counts.every(c => c === counts[0]);
        const avgCount = counts.reduce((a, b) => a + b, 0) / counts.length;
        
        tests.push({
          selector: selector,
          elementCount: groupElements.length,
          testResults: testResults,
          isConsistent: isConsistent,
          averageCount: avgCount,
          reliability: isConsistent ? 100 : Math.max(0, 100 - (Math.max(...counts) - Math.min(...counts)) * 10)
        });
        
      } catch (error) {
        tests.push({
          selector: selector,
          elementCount: groupElements.length,
          error: error.message,
          reliability: 0
        });
      }
    }

    return tests;
  }

  /**
   * Detect changes in UI elements
   */
  detectUIChanges(discovery) {
    const changes = [];
    const existingElements = this.knowledgeBase.uiElements.get(discovery.name);
    
    if (!existingElements) {
      changes.push({
        type: 'new_element_group',
        groupName: discovery.name,
        description: `New UI element group discovered: ${discovery.name}`,
        timestamp: new Date().toISOString()
      });
    } else {
      // Compare selectors
      const oldSelectors = existingElements.patterns?.map(p => p.pattern) || [];
      const newSelectors = discovery.patterns.map(p => p.pattern);
      
      const addedSelectors = newSelectors.filter(s => !oldSelectors.includes(s));
      const removedSelectors = oldSelectors.filter(s => !newSelectors.includes(s));
      
      if (addedSelectors.length > 0) {
        changes.push({
          type: 'selectors_added',
          groupName: discovery.name,
          selectors: addedSelectors,
          timestamp: new Date().toISOString()
        });
      }
      
      if (removedSelectors.length > 0) {
        changes.push({
          type: 'selectors_removed',
          groupName: discovery.name,
          selectors: removedSelectors,
          timestamp: new Date().toISOString()
        });
      }
      
      // Compare reliability scores
      const oldReliability = existingElements.reliability || 0;
      const newReliability = discovery.reliability || 0;
      
      if (Math.abs(oldReliability - newReliability) > 20) {
        changes.push({
          type: 'reliability_changed',
          groupName: discovery.name,
          oldReliability: oldReliability,
          newReliability: newReliability,
          timestamp: new Date().toISOString()
        });
      }
    }
    
    return changes;
  }

  /**
   * Identify patterns in UI discoveries
   */
  identifyUIPatterns(discoveries) {
    const patterns = [];
    
    // Pattern: Common data-testid prefixes
    const testIds = discoveries
      .flatMap(d => d.elements)
      .map(e => e.attributes?.['data-testid'])
      .filter(Boolean);
      
    if (testIds.length > 0) {
      const prefixes = testIds
        .map(id => id.split('-')[0])
        .filter(prefix => prefix.length > 2);
        
      const prefixCounts = prefixes.reduce((acc, prefix) => {
        acc[prefix] = (acc[prefix] || 0) + 1;
        return acc;
      }, {});
      
      for (const [prefix, count] of Object.entries(prefixCounts)) {
        if (count > 1) {
          patterns.push({
            type: 'common_testid_prefix',
            prefix: prefix,
            count: count,
            examples: testIds.filter(id => id.startsWith(prefix)).slice(0, 3)
          });
        }
      }
    }
    
    // Pattern: Common class name patterns
    const classNames = discoveries
      .flatMap(d => d.elements)
      .flatMap(e => (e.attributes?.class || '').split(' '))
      .filter(cls => cls.length > 3);
      
    const classCounts = classNames.reduce((acc, cls) => {
      acc[cls] = (acc[cls] || 0) + 1;
      return acc;
    }, {});
    
    for (const [className, count] of Object.entries(classCounts)) {
      if (count > 2) {
        patterns.push({
          type: 'common_class_name',
          className: className,
          count: count
        });
      }
    }
    
    return patterns;
  }

  /**
   * Generate UI recommendations
   */
  generateUIRecommendations(discoveries) {
    const recommendations = [];
    
    for (const discovery of discoveries) {
      // Recommend best selector
      if (discovery.bestSelector && discovery.reliability > 70) {
        recommendations.push({
          type: 'reliable_selector',
          groupName: discovery.name,
          selector: discovery.bestSelector,
          reliability: discovery.reliability,
          recommendation: `Use '${discovery.bestSelector}' for ${discovery.name} (${discovery.reliability}% reliable)`
        });
      }
      
      // Warn about unreliable selectors
      if (discovery.reliability < 50) {
        recommendations.push({
          type: 'unreliable_selector',
          groupName: discovery.name,
          reliability: discovery.reliability,
          recommendation: `${discovery.name} selectors are unreliable (${discovery.reliability}% reliable). Consider alternative approaches.`
        });
      }
      
      // Recommend data-testid usage
      const hasTestId = discovery.patterns.some(p => p.pattern.includes('data-testid'));
      if (!hasTestId && discovery.elements.length > 0) {
        recommendations.push({
          type: 'missing_testid',
          groupName: discovery.name,
          recommendation: `Consider requesting data-testid attributes for ${discovery.name} elements for more reliable automation.`
        });
      }
    }
    
    return recommendations;
  }

  /**
   * Update UI knowledge base
   */
  updateUIKnowledgeBase(analysis) {
    for (const discovery of analysis.elements) {
      const key = discovery.groupName || 'unknown';
      this.knowledgeBase.uiElements.set(key, {
        ...discovery,
        lastSeen: new Date().toISOString(),
        discoveryCount: (this.knowledgeBase.uiElements.get(key)?.discoveryCount || 0) + 1
      });
    }
    
    this.knowledgeBase.metadata.lastDiscovery = new Date().toISOString();
    this.knowledgeBase.metadata.discoveryCount += 1;
  }

  /**
   * Complete UI discovery session
   */
  async completeUISession() {
    if (!this.activeUISession) {
      throw new Error('No active UI discovery session');
    }

    const session = this.activeUISession;
    session.endTime = new Date().toISOString();
    session.duration = new Date(session.endTime) - new Date(session.startTime);
    
    // Generate session report
    await this.generateUISessionReport(session);
    
    // Save knowledge base
    await this.saveKnowledgeBase();
    
    // Add to history
    this.discoveryHistory.push(session);
    
    console.log(`UI discovery session completed: ${session.name}`);
    console.log(`Total discoveries: ${session.discoveries.length}`);
    console.log(`Total elements found: ${session.discoveries.reduce((sum, d) => sum + (d.discoveredElements?.length || 0), 0)}`);
    
    this.activeUISession = null;
    return session;
  }

  /**
   * Generate UI session report
   */
  async generateUISessionReport(session) {
    const reportData = {
      session: {
        id: session.id,
        name: session.name,
        version: session.version,
        startTime: session.startTime,
        endTime: session.endTime,
        duration: session.duration
      },
      summary: {
        totalScenarios: session.scenarios.length,
        totalDiscoveries: session.discoveries.length,
        totalElements: session.discoveries.reduce((sum, d) => sum + (d.discoveredElements?.length || 0), 0),
        averageReliability: this.calculateAverageReliability(session.discoveries)
      },
      discoveries: session.discoveries,
      knowledgeBaseStats: {
        totalUIElements: this.knowledgeBase.uiElements.size,
        lastDiscovery: this.knowledgeBase.metadata.lastDiscovery,
        discoveryCount: this.knowledgeBase.metadata.discoveryCount
      }
    };

    const reportPath = path.join(this.options.outputDir, 'reports', `ui-discovery-${session.id}.json`);
    await fs.writeFile(reportPath, JSON.stringify(reportData, null, 2));
    
    // Generate human-readable summary
    const summaryPath = path.join(this.options.outputDir, 'reports', `ui-discovery-${session.id}-summary.md`);
    const summary = this.generateUIMarkdownSummary(reportData);
    await fs.writeFile(summaryPath, summary);
  }

  /**
   * Calculate average reliability across discoveries
   */
  calculateAverageReliability(discoveries) {
    const reliabilities = discoveries
      .flatMap(d => d.reliabilityTests || [])
      .map(t => t.reliability)
      .filter(r => typeof r === 'number');
      
    return reliabilities.length > 0 
      ? Math.round(reliabilities.reduce((a, b) => a + b, 0) / reliabilities.length)
      : 0;
  }

  /**
   * Generate markdown summary of UI discovery session
   */
  generateUIMarkdownSummary(reportData) {
    const { session, summary, discoveries } = reportData;
    
    let markdown = `# UI Discovery Report: ${session.name}\n\n`;
    markdown += `**Session ID**: ${session.id}\n`;
    markdown += `**Version**: ${session.version}\n`;
    markdown += `**Duration**: ${Math.round(session.duration / 1000)}s\n`;
    markdown += `**Date**: ${new Date(session.startTime).toLocaleDateString()}\n\n`;
    
    markdown += `## Summary\n\n`;
    markdown += `- **Total Scenarios**: ${summary.totalScenarios}\n`;
    markdown += `- **Total Elements Discovered**: ${summary.totalElements}\n`;
    markdown += `- **Average Reliability**: ${summary.averageReliability}%\n\n`;
    
    markdown += `## Discovered UI Elements\n\n`;
    
    for (const discovery of discoveries) {
      markdown += `### ${discovery.scenarioName}\n\n`;
      
      for (const elementGroup of discovery.elementDiscoveries || []) {
        markdown += `#### ${elementGroup.name}\n\n`;
        markdown += `- **Best Selector**: \`${elementGroup.bestSelector || 'None found'}\`\n`;
        markdown += `- **Reliability**: ${elementGroup.reliability}%\n`;
        markdown += `- **Elements Found**: ${elementGroup.elements.length}\n\n`;
        
        if (elementGroup.patterns.length > 0) {
          markdown += `**Tested Patterns**:\n`;
          for (const pattern of elementGroup.patterns) {
            markdown += `- \`${pattern.pattern}\` - ${pattern.matchCount} matches\n`;
          }
          markdown += `\n`;
        }
      }
    }
    
    return markdown;
  }

  /**
   * Utility delay function
   */
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = {
  UIDiscovery
};