import { useNavigate, useLocation } from "react-router-dom";
import { USER, GLOBE, TROPHY } from "@/components/Icons";
import useUIStore from "@/hooks/useUIStore";
import { motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";

const MobileFooter = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { selectedTab, setSelectedTab } = useUIStore();
  const [activeTabIndex, setActiveTabIndex] = useState(0);
  const [indicatorWidth, setIndicatorWidth] = useState(0);
  const [indicatorLeft, setIndicatorLeft] = useState(0);

  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

  // Determine active tab index based on location and selectedTab
  useEffect(() => {
    if (location.pathname === "/create-tournament") {
      setActiveTabIndex(2);
    } else if (location.pathname === "/" && selectedTab === "my") {
      setActiveTabIndex(1);
    } else {
      setActiveTabIndex(0);
    }
  }, [location.pathname, selectedTab]);

  // Update indicator position and width based on active tab
  useEffect(() => {
    const activeTab = tabRefs.current[activeTabIndex];
    if (activeTab) {
      const { width, left } = activeTab.getBoundingClientRect();
      const parentLeft =
        activeTab.parentElement?.getBoundingClientRect().left || 0;

      // Make indicator 60% of the button width
      const indicatorWidth = width * 0.8;

      // Center the indicator under the button
      const indicatorLeft = left - parentLeft + (width - indicatorWidth) / 2;

      setIndicatorWidth(indicatorWidth);
      setIndicatorLeft(indicatorLeft);
    }
  }, [activeTabIndex]);

  return (
    <div className="sm:hidden fixed bottom-0 left-0 right-0 bg-black flex flex-row items-stretch h-12 z-50 relative">
      {/* Animated indicator */}
      <motion.div
        className="absolute top-0 h-1 bg-brand"
        initial={false}
        animate={{
          width: indicatorWidth,
          left: indicatorLeft,
        }}
        transition={{ type: "spring", stiffness: 300, damping: 30 }}
      />

      <button
        ref={(el) => (tabRefs.current[0] = el)}
        className={`flex flex-col items-center justify-center flex-1 ${
          activeTabIndex === 0 ? "text-brand" : "text-gray-400"
        }`}
        onClick={() => {
          navigate("/");
          setSelectedTab("upcoming");
        }}
      >
        <span className="h-10 w-10">
          <GLOBE />
        </span>
      </button>

      <button
        ref={(el) => (tabRefs.current[1] = el)}
        className={`flex flex-col items-center justify-center flex-1 ${
          activeTabIndex === 1 ? "text-brand" : "text-gray-400"
        }`}
        onClick={() => {
          navigate("/");
          setSelectedTab("my");
        }}
      >
        <span className="h-10 w-10">
          <USER />
        </span>
      </button>

      <button
        ref={(el) => (tabRefs.current[2] = el)}
        className={`flex flex-col items-center justify-center flex-1 ${
          activeTabIndex === 2 ? "text-brand" : "text-gray-400"
        }`}
        onClick={() => navigate("/create-tournament")}
      >
        <span className="h-10 w-10">
          <TROPHY />
        </span>
      </button>
    </div>
  );
};

export default MobileFooter;
