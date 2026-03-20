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

      // Make indicator 50% of the button width
      const indicatorWidth = width * 0.5;

      // Center the indicator under the button
      const indicatorLeft = left - parentLeft + (width - indicatorWidth) / 2;

      setIndicatorWidth(indicatorWidth);
      setIndicatorLeft(indicatorLeft);
    }
  }, [activeTabIndex]);

  return (
    <div className="sm:hidden fixed bottom-0 left-0 right-0 glass-surface-elevated flex flex-row items-stretch h-14 z-50 border-t border-brand/8">
      {/* Animated indicator */}
      <motion.div
        className="absolute top-0 h-0.5 bg-brand rounded-full"
        initial={false}
        animate={{
          width: indicatorWidth,
          left: indicatorLeft,
        }}
        transition={{ type: "spring", stiffness: 400, damping: 35 }}
      />

      <button
        ref={(el) => (tabRefs.current[0] = el)}
        className={`flex flex-col items-center justify-center flex-1 transition-colors duration-200 ${
          activeTabIndex === 0 ? "text-brand" : "text-neutral"
        }`}
        onClick={() => {
          navigate("/");
          setSelectedTab("upcoming");
        }}
      >
        <span className="h-8 w-8">
          <GLOBE />
        </span>
        <span className="text-[10px] mt-0.5 font-medium">Browse</span>
      </button>

      <button
        ref={(el) => (tabRefs.current[1] = el)}
        className={`flex flex-col items-center justify-center flex-1 transition-colors duration-200 ${
          activeTabIndex === 1 ? "text-brand" : "text-neutral"
        }`}
        onClick={() => {
          navigate("/");
          setSelectedTab("my");
        }}
      >
        <span className="h-8 w-8">
          <USER />
        </span>
        <span className="text-[10px] mt-0.5 font-medium">Mine</span>
      </button>

      <button
        ref={(el) => (tabRefs.current[2] = el)}
        className={`flex flex-col items-center justify-center flex-1 transition-colors duration-200 ${
          activeTabIndex === 2 ? "text-brand" : "text-neutral"
        }`}
        onClick={() => navigate("/create-tournament")}
      >
        <span className="h-8 w-8">
          <TROPHY />
        </span>
        <span className="text-[10px] mt-0.5 font-medium">Create</span>
      </button>
    </div>
  );
};

export default MobileFooter;
